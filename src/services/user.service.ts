import { json2csv } from 'json-2-csv';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';

import { fetchWorkrDeliveries, isDeliveryLookupConfigured, NOTIFICATION_LOOKUP_MAX_USER_IDS } from '../apis/notificationDeliveries.api';
import logger from '../configs/logger.config';
import sequelize from '../db/models/sequelize';
import User from '../db/models/user.model';
import { FindUserByNameDto, LoginUserDto, RegisterUserDto } from '../dtos/user.dto';
import { UpdateUserDto } from '../dtos/userProfile.dto';
import LeadNurtureRepository from '../repository/leadNurture.repository';
import RoleRepository from '../repository/role.repository';
import UserRepository from '../repository/user.repository';
import UserProfileRepository from '../repository/userProfile.repository';
import UserRoleRepository from '../repository/userRole.repository';
import { NurtureView } from '../types/LeadNurtureView';
import { WorkrDelivery } from '../types/WorkrDelivery';
import { checkPassword, createToken, verifyToken } from '../utils/auth/auth';
import { BadRequestError, InternalServerError, NotFoundError, UnauthorizedError } from '../utils/errors/app.error';
import { formatter } from '../utils/helpers/date.helper';
import { istDayKey, istDayRange, lastDayKeys } from '../utils/helpers/istDay.helper';
import { attachDeliveries, buildNurtureView } from '../utils/helpers/leadNurtureView.helper';
import leadNurtureService from './leadNurture.service';


class UserService {
    private userRepository: UserRepository;
    private userProfileRepository : UserProfileRepository;
    private roleRepository: RoleRepository;
    private userRoleRepository: UserRoleRepository;
    private leadNurtureRepository = new LeadNurtureRepository();

    constructor(userRepository: UserRepository, userProfileRepository: UserProfileRepository, roleRepository: RoleRepository, userRoleRepository: UserRoleRepository) {
        this.userRepository = userRepository;
        this.userProfileRepository = userProfileRepository;
        this.roleRepository = roleRepository;
        this.userRoleRepository = userRoleRepository;
    }

    async findByNameService(data: FindUserByNameDto){
        const limit = Number.isNaN(data.limit) ? 10 : Number(data.limit);
        const page = Number.isNaN(data.page) ? 1 : Number(data.page);
        const offset = (page - 1) * limit;
        
        const users =await this.userRepository.findByName(data.fullName, limit, offset);
        return users ;
    }

    async findByEmailService(email: string){
        const user = await this.userRepository.findByEmailWithoutPassword(email);
        return user ;
    }

    async createService(userData: RegisterUserDto) {
        const checkUser = await this.userRepository.findByEmail(userData.email);
        if (checkUser) {
            logger.error('User already registered');
            throw new BadRequestError('User already registered');
        }
        const roles = await this.roleRepository.getRoles('jobseeker');
        const roleId = roles[0].id ;

        const { currentCtc, currentCompany, details, domain } = userData;
        const transaction = await sequelize.transaction();
        let newUser: User;
        try {
            newUser = await this.userRepository.create(userData, transaction);
            await this.userProfileRepository.create({ userId: newUser.id, currentCtc, currentCompany, details, domain}, transaction);
            await this.userRoleRepository.createUserRole({userId: newUser.id, roleId: roleId, transaction});
            await transaction.commit();
        } catch (error){
            await transaction.rollback();
            logger.error('Error while creating user ', {error});
            throw new InternalServerError('Error while creating user ');
        }

        const jwtToken = createToken({id: newUser.id, email: newUser.email});

        // Product company readiness check email/WhatsApp: runs only after the commit and only enqueues for Working Professionals
        // (decided from `details` in the request body). Deliberately NOT awaited: the signup response
        // must never wait on Redis. handleWorkrSignup never rejects, logs its own failures, and the
        // job id makes a late enqueue idempotent.
        void leadNurtureService.handleWorkrSignup({
            userId: newUser.id,
            fullName: newUser.fullName,
            email: newUser.email,
            phoneNo: newUser.phoneNo,
            details,
            domain,
            graduationYear: userData.graduationYear,
            signedUpAt: newUser.createdAt
        });

        return jwtToken;
    }

    async loginService(userData: LoginUserDto){
        const checkUser = await this.userRepository.findByEmail(userData.email);

        if (!checkUser) {
            logger.error('User not found', userData.email);
            throw new NotFoundError('User not found');
        }
        
        const verified = await checkPassword(userData.password , checkUser.password);

        if(!verified) {
            logger.error('Incorrect credentials', userData.email);
            throw new BadRequestError('Incorrect credentials');
        }

        const jwtToken = createToken({id: checkUser.id, email: checkUser.email});
        return jwtToken;
    }

    async findAllCandidatesService({userId, page, limit, details, date}:{userId: number, page: number, limit: number, details: string, date?: string}) {
        const userRoles = await this.userRepository.getUserRolesById(userId);
    
        const roleNames = userRoles.roles?.map((role) => role.name);
        if(!roleNames) {
            logger.error('No roles found');
            throw new NotFoundError('No roles found ');
        }
            
        if(!roleNames.includes('admin')){
            logger.error('Not an admin');
            throw new UnauthorizedError('Not an admin');
        }

        const offset = (page - 1) * limit;


        const { rows: records, count: totalCount } = await this.userRepository.findAllCandidates({limit, offset, details, range: date ? istDayRange(date) : undefined});
        const totalPages = Math.ceil(totalCount / limit);

        return {
            records: await this.withNurtureStatus(records),
            pagination: {
                totalCount,
                totalPages,
                currentPage: page,
                limit,
            },
        };
    }

    /**
     * Adds each person's nurture status to the admin list. If the nurture rows cannot be read, `nurture` is null for everyone
     * (the list still loads, and the screen says the status is unavailable instead of claiming nobody is in the sequence).
     */
    private async withNurtureStatus(users: User[]) {
        let rowsByUser: Map<number, Awaited<ReturnType<LeadNurtureRepository['findByUserIds']>>[number]> | null = null;

        try {
            const rows = await this.leadNurtureRepository.findByUserIds(users.map((user) => user.id));
            rowsByUser = new Map(rows.map((row) => [Number(row.userId), row]));
        } catch (error) {
            logger.error('Could not load the nurture status for the candidates list', {
                message: error instanceof Error ? error.message : String(error)
            });
        }

        const views = new Map<number, NurtureView>();
        if (rowsByUser) {
            for (const user of users) {
                views.set(user.id, buildNurtureView(rowsByUser.get(user.id) ?? null, user.phoneNo));
            }
        }

        const deliveriesByUser = await this.loadDeliveries([...views].filter(([, view]) => view.inSequence).map(([userId]) => userId));

        return users.map((user) => {
            const view = views.get(user.id) ?? null;
            const deliveries = deliveriesByUser?.get(user.id);

            return {
                ...user.toJSON(),
                nurture: view && deliveries ? attachDeliveries(view, deliveries) : view
            };
        });
    }

    /**
     * What the notification-service says became of each person's messages, keyed by user id. null when it could not be asked
     * (not configured, down, timed out): the list still loads and the screen then shows the delivery results as unknown.
     */
    private async loadDeliveries(userIds: number[]): Promise<Map<number, WorkrDelivery[]> | null> {
        if (userIds.length === 0 || !isDeliveryLookupConfigured()) {
            return null;
        }

        try {
            const byUser = new Map<number, WorkrDelivery[]>(userIds.map((userId) => [userId, []]));

            for (let start = 0; start < userIds.length; start += NOTIFICATION_LOOKUP_MAX_USER_IDS) {
                const chunk = userIds.slice(start, start + NOTIFICATION_LOOKUP_MAX_USER_IDS);
                for (const delivery of await fetchWorkrDeliveries(chunk)) {
                    byUser.get(delivery.userId)?.push(delivery);
                }
            }

            return byUser;
        } catch (error) {
            logger.error('Could not load the delivery results for the candidates list', {
                message: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }

    async findByIdService(id: number) {
        const user = await this.userRepository.findById(id);
        if (!user) {
            logger.error('User not found');
            throw new NotFoundError('User not found');
        }
        return user;
    }

    async updateByIdService(userUpdateData: UpdateUserDto){
        const {id, ...data} = userUpdateData;
        return await this.userRepository.updateById(id, data);
    }

    async deleteById() {}

    async softDeleteService(id: number) {
        return await this.userRepository.softDelete(id);
    }

    async getAllCandidatesForCSVService({ userId, details, date }: { userId: number, details: string, date?: string }) {
        const userRoles = await this.userRepository.getUserRolesById(userId);

        const roleNames = userRoles.roles?.map(r => r.name);
        if (!roleNames) {
            logger.error('No roles found');
            throw new NotFoundError('No roles found');
        }
        if (!roleNames.includes('admin')) {
            logger.error('Not an admin');
            throw new UnauthorizedError('Not an admin');
        }

        const candidates: User[] = await this.userRepository.findAllCandidatesForCSV(details, date ? istDayRange(date) : undefined);

        const plainCandidates = candidates.map((candidate) => ({
            ...candidate.toJSON(),
            createdAt: formatter(candidate.createdAt)
        }));

        let csv: string;

        if(details == 'Student'){
            csv = json2csv(plainCandidates, { keys: [ 'fullName', 'email', 'phoneNo', 'graduationYear','profile.domain', 'createdAt'], fieldTitleMap: { 'profile.domain': 'domain', 'createdAt': 'leadCapturedAt' } }, );
        }else{
            csv = json2csv(plainCandidates, { keys: [ 'fullName', 'email', 'phoneNo', 'graduationYear', 'profile.currentCtc', 'profile.currentCompany', 'profile.domain', 'createdAt'], fieldTitleMap: { 'profile.currentCtc': 'currentCtc', 'profile.currentCompany': 'currentCompany', 'profile.domain': 'domain', 'createdAt': 'leadCapturedAt' } });
        }

        return csv;
    }


    /**
     * Admin only. How many job seekers signed up on each of the last `days` Indian calendar days (today first),
     * split into students and working professionals. Days with no sign-ups are included with zeros.
     */
    async getSignupsByDayService({ userId, days }: { userId: number, days: number }) {
        const userRoles = await this.userRepository.getUserRolesById(userId);

        const roleNames = userRoles.roles?.map(r => r.name);
        if (!roleNames) {
            logger.error('No roles found');
            throw new NotFoundError('No roles found');
        }
        if (!roleNames.includes('admin')) {
            logger.error('Not an admin');
            throw new UnauthorizedError('Not an admin');
        }

        const dayKeys = lastDayKeys(days);
        const since = istDayRange(dayKeys[dayKeys.length - 1]).from;
        const signups = await this.userRepository.findJobseekerSignupsSince(since);

        const buckets = new Map(dayKeys.map((key) => [key, { date: key, total: 0, students: 0, workingProfessionals: 0 }]));
        for (const signup of signups) {
            const bucket = buckets.get(istDayKey(signup.createdAt));
            if (!bucket) {
                continue;
            }
            bucket.total += 1;
            if (signup.details === 'Student') {
                bucket.students += 1;
            } else {
                bucket.workingProfessionals += 1;
            }
        }

        return {
            timezone: 'Asia/Kolkata',
            days: dayKeys.map((key) => buckets.get(key)!),
        };
    }

    isAuthenticated(authToken: string){
        try {
            const decoded = verifyToken(authToken as string);
            return decoded;
            
        } catch (error) {
            if (error instanceof TokenExpiredError) {
                return new UnauthorizedError('Session expired. Please login again.');
            } else if (error instanceof JsonWebTokenError) {
                logger.error('Invalid token');
                throw new UnauthorizedError('Invalid token');
            } else {
                logger.error('Verification of token failed');
                throw new UnauthorizedError('Verification of token failed');
            }
      
        }
    }
}
export default UserService;