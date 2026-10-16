import { CreationAttributes, Op, Transaction } from 'sequelize';

import User from '../db/models/user.model';
import UserProfile from '../db/models/userProfile.model';
import { BadRequestError, NotFoundError } from '../utils/errors/app.error';
import BaseRepository from './base.repository';

class UserRepository extends BaseRepository<User> {
    constructor() {
        super(User);
    }


    async findByName(
        fullName: string,
        limit: number ,
        offset: number
    ){
        const data = await this.model.findAndCountAll({
            where: {
                fullName: {
                    // Match anywhere in the name ("akhila" finds "Avula Akhila").
                    [Op.like]: `%${fullName.replace(/[\\%_]/g, (char) => `\\${char}`)}%`,
                },
            },
            attributes: { exclude: ['password'] },
            include: [
                {
                    association: User.associations.profile,
                    required: false,
                },
            ],
            distinct: true,
            limit,
            offset,
            order: [['createdAt', 'DESC']],
        });

        return data;
    }

    async findByEmailWithoutPassword(email: string): Promise<User | null>{
        const checkUser = await User.findOne({
            where : {email},
            attributes: { exclude: ['password']},
            include: [{ association: User.associations.profile, required: false }],
        });
        return checkUser;
    }

    async findByEmail(email: string): Promise<User | null>{
        const checkUser = await User.findOne({where : {email}});
        return checkUser;
    }
    async create(data: CreationAttributes<User>, transaction?: Transaction ): Promise<User> {
        const record = await this.model.create(data, { transaction });
        return record;
    }

    async softDelete(id: number): Promise<boolean> {
        const record = await this.model.findByPk(id);

        if (!record) {
            throw new NotFoundError('User not found');
        }

        if (record.deletedAt) {
            throw new BadRequestError('User already deleted');
        }

        record.deletedAt = new Date();
        await record.save();
        return true;
    }

    async findById (id: number): Promise<User | null> {
        const user = await this.model.findByPk(id, {
            attributes: ['fullName','email', 'phoneNo', 'id', 'graduationYear'],
            include: [
                {
                    association: User.associations.profile,
                    attributes: { exclude: ['userId']},
                    include: [
                        {
                            association: UserProfile.associations.currentLocation,
                            attributes: ['name']
                        }
                    ]
                },
                {
                    association: User.associations.skills,
                    attributes: ['id','name']
                },
                {
                    association: User.associations.roles,
                    attributes: ['id','name']
                }
            ]
        });
        return user;
    }

    async findAllCandidates({limit, offset, details, range}:{limit: number, offset: number, details: string, range?: {from: Date, to: Date}}){
        const users = await this.model.findAndCountAll({
            attributes: ['fullName','email', 'phoneNo', 'id', 'graduationYear', 'created_at'],
            where: {
                deletedAt: {
                    [Op.eq]: null
                },
                // Optional: only people who signed up inside [from, to)
                ...(range ? { createdAt: { [Op.gte]: range.from, [Op.lt]: range.to } } : {})
            },
            include: [
                {
                    association: User.associations.roles,
                    where: {
                        name: 'jobseeker'
                    }
                },
                {
                    association: User.associations.profile,
                    where: {
                        details: details 
                    }
                }
            ],
            order: [['created_at', 'DESC']],
            limit,
            offset,
        });

        return users ;
    }

    async findAllCandidatesForCSV(details: string, range?: {from: Date, to: Date}): Promise<User[]>{
        const candidates = await this.model.findAll({
            attributes: ['fullName','email', 'phoneNo', 'graduationYear', 'createdAt'],
            where: {
                deletedAt: {
                    [Op.eq]: null
                },
                ...(range ? { createdAt: { [Op.gte]: range.from, [Op.lt]: range.to } } : {})
            },
            include: [
                {
                    association: this.model.associations.roles,
                    where: {
                        name: 'jobseeker'
                    },
                    attributes: []
                },
                {
                    association: this.model.associations.profile,
                    where: {
                        details: details
                    },
                    attributes: ['yearsOfExperience', 'currentCtc', 'currentCompany', 'domain']
                }
            ],
            order: [['created_at', 'DESC']],
        });

        return candidates;
    }

    /**
     * Sign-up time and type of every job seeker (Student / Working Professional, the same people the candidates lists show)
     * who joined at or after `since`. The service buckets them into IST days.
     */
    async findJobseekerSignupsSince(since: Date): Promise<{ createdAt: Date, details: string }[]>{
        const users = await this.model.findAll({
            attributes: ['id', 'createdAt'],
            where: {
                deletedAt: {
                    [Op.eq]: null
                },
                createdAt: {
                    [Op.gte]: since
                }
            },
            include: [
                {
                    association: this.model.associations.roles,
                    where: {
                        name: 'jobseeker'
                    },
                    attributes: []
                },
                {
                    association: this.model.associations.profile,
                    where: {
                        details: { [Op.in]: ['Student', 'Working Professional'] }
                    },
                    attributes: ['details']
                }
            ],
        });

        return users.map((user) => ({ createdAt: user.createdAt, details: String(user.profile?.details) }));
    }

    async getUserRolesById(userId: number){
        const user = await this.model.findByPk(userId, {
            include: [
                {
                    association: User.associations.roles,
                    attributes: ['name']
                }
            ]
        });
        
        if (!user) {
            throw new NotFoundError('User not found');
        }

        return user;
    }
    
}

export default UserRepository;