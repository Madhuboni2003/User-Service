import { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

import LeadNurtureRepository from '../repository/leadNurture.repository';
import RoleRepository from '../repository/role.repository';
import UserRepository from '../repository/user.repository';
import UserProfileRepository from '../repository/userProfile.repository';
import UserRoleRepository from '../repository/userRole.repository';
import NurtureLeadsService from '../services/nurtureLeads.service';
import UserService from '../services/user.service';
import UserProfileService from '../services/userProfile.service';
import { AuthRequest } from '../types/AuthRequest';
import { BadRequestError } from '../utils/errors/app.error';
import { isValidDayKey } from '../utils/helpers/istDay.helper';
import { nurtureLeadsQuerySchema, nurtureLeadsSummaryQuerySchema } from '../validators/nurtureLeads.validator';

const userRepository = new UserRepository();
const userProfileRepository = new UserProfileRepository();
const userRoleRepository = new UserRoleRepository();
const roleRepository = new RoleRepository();

const userService = new UserService(userRepository, userProfileRepository, roleRepository, userRoleRepository);
const userProfileService = new UserProfileService(userProfileRepository);
const nurtureLeadsService = new NurtureLeadsService(userRepository, new LeadNurtureRepository());

async function getUsersByName(req: Request, res: Response, next: NextFunction){
    try{
        const fullName = String(req.query.name);
        const page = Number(req.query.page);
        const limit = Number(req.query.limit);

        const userList = await userService.findByNameService({fullName, page, limit} );
        
        res.status(StatusCodes.OK).json({
            success: true,
            message: 'User list retrieved successfully',
            data: userList,
            error: {}
        });
    }catch(error){
        next(error);
    }
}

async function getUsersByEmail(req: Request, res: Response, next: NextFunction){
    try{
        const email = String(req.query.email);
        const user = await userService.findByEmailService(email);
        
        res.status(StatusCodes.OK).json({
            success: true,
            message: 'User list retrieved successfully',
            data: user,
            error: {}
        });
    }catch(error){
        next(error);
    }
}

async function uploadResumeHandler(req: Request, res: Response) {
    if (!req.file) {
        res.status(StatusCodes.BAD_REQUEST).json({
            success: false,
            message: 'No file uploaded',
            data: {},
            error: {
                message: 'Bad Request'
            }
        });
    }


    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fileUrl = (req.file as any).location;

    res.status(StatusCodes.OK).json({
        success: true,
        message: 'Succesfully uploaded the resume',
        data: {
            fileUrl
        },
        error: {}
    });
}

async function getSelfDetails(req: AuthRequest, res: Response, next: NextFunction){
    try {
        const id = req.user?.id;
        const userDetails = await userService.findByIdService(Number(id));
        
        res.status(StatusCodes.OK).json({
            success: true,
            message: 'User details retrieved successfully',
            data: userDetails,
            error: {}
        });

    } catch (error) {
        next(error); 
    }
    
}

async function updateUserProfileHandler(req: Request, res: Response, next: NextFunction) {
    try {
        const id = req.params.id;
        const data = req.body;
        const updateUserProfileData= {
            id: Number(id),
            ...data
        };

        const updatedUser = await userProfileService.updateByIdService(updateUserProfileData);

        res.status(StatusCodes.OK).json({
            success: true,
            message: 'User updated successfully',
            data: updatedUser,
            error: {}
        });
    } catch (error) {
        next(error);
    }
}


async function updateUserHandler(req: Request, res: Response, next: NextFunction) {
    try {
        const id = req.params.id;
        const data = req.body;
        const userUpdateData = {
            id: Number(id),
            ...data
        };

        const updatedSkills = await userService.updateByIdService(userUpdateData);

        res.status(StatusCodes.OK).json({
            success: true,
            message: 'User skills updated successfully',
            data: updatedSkills,
            error: {}
        });
    } catch (error) {
        next(error);
    }
}

async function getUserDetailsById(req: AuthRequest, res: Response, next: NextFunction){
    try {
        const id= req.params.id ;
        const userDetails = await userService.findByIdService(Number(id));
        res.status(StatusCodes.OK).json({
            success: true,
            message: 'User skills updated successfully',
            data: userDetails,
            error: {}
        });     
    } catch (error) {
        next(error);
    }
}

/** Optional ?date=YYYY-MM-DD (an Indian calendar day). Missing or empty means "all time". */
function parseDateQuery(value: unknown): string | undefined {
    if (value === undefined || value === '') {
        return undefined;
    }
    if (!isValidDayKey(value)) {
        throw new BadRequestError('date must be a valid day written as YYYY-MM-DD');
    }
    return value;
}

async function getAllUsers(req: AuthRequest, res: Response, next: NextFunction){
    try {
        const id = Number(req.user?.id);
        const details = String(req.query.details);
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;

        const date = parseDateQuery(req.query.date);

        const response = await userService.findAllCandidatesService({userId: id, page, limit, details, date});
        res.status(StatusCodes.OK).json({
            success: true,
            message: 'Users fetched successfully',
            data: response,
            error: {}
        });
    } catch (error) {
        next(error);
    }
}

async function getAllCandidatesCSV(req: AuthRequest, res: Response, next: NextFunction){
    try {
        const userId = Number( req.user?.id );
        const details = String( req.query.details );
        const date = parseDateQuery(req.query.date);
        const stringCSV = await userService.getAllCandidatesForCSVService({userId, details, date});
        res.setHeader('Content-Type', 'text/csv')
            .setHeader('Content-Disposition', 'attachment; filename="candidates.csv"')
            .status(StatusCodes.OK)
            .send(stringCSV);
    } catch (error) {
        next(error);
    }
}

async function getSignupsByDay(req: AuthRequest, res: Response, next: NextFunction){
    try {
        const userId = Number(req.user?.id);
        const requested = Number(req.query.days ?? 30);
        if (!Number.isInteger(requested) || requested < 1 || requested > 365) {
            throw new BadRequestError('days must be a whole number between 1 and 365');
        }

        const response = await userService.getSignupsByDayService({ userId, days: requested });
        res.status(StatusCodes.OK).json({
            success: true,
            message: 'Sign-ups by day fetched successfully',
            data: response,
            error: {}
        });
    } catch (error) {
        next(error);
    }
}

async function getNurtureLeads(req: AuthRequest, res: Response, next: NextFunction){
    try {
        const parsed = nurtureLeadsQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            throw new BadRequestError(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'query'}: ${issue.message}`).join('; '));
        }

        const result = await nurtureLeadsService.listLeads(Number(req.user?.id), parsed.data);

        if ('csv' in result) {
            res.setHeader('Content-Type', 'text/csv')
                .setHeader('Content-Disposition', `attachment; filename="nurture-day-${parsed.data.day}-leads.csv"`)
                .status(StatusCodes.OK)
                .send(result.csv);
            return;
        }

        res.status(StatusCodes.OK).json({
            success: true,
            message: 'Nurture leads fetched successfully',
            data: result,
            error: {}
        });
    } catch (error) {
        next(error);
    }
}

async function getNurtureLeadsSummary(req: AuthRequest, res: Response, next: NextFunction){
    try {
        const parsed = nurtureLeadsSummaryQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            throw new BadRequestError(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'query'}: ${issue.message}`).join('; '));
        }

        const result = await nurtureLeadsService.summary(Number(req.user?.id), parsed.data.status);
        res.status(StatusCodes.OK).json({
            success: true,
            message: 'Nurture summary fetched successfully',
            data: result,
            error: {}
        });
    } catch (error) {
        next(error);
    }
}

export default {
    getNurtureLeadsSummary,
    getNurtureLeads,
    getSignupsByDay,
    getAllUsers,
    getSelfDetails,
    updateUserHandler,
    updateUserProfileHandler,
    uploadResumeHandler,
    getUserDetailsById,
    getUsersByName,
    getUsersByEmail,
    getAllCandidatesCSV
};