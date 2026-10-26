import { NextFunction,  Response } from 'express';

import logger from '../configs/logger.config';
import RoleRepository from '../repository/role.repository';
import UserRepository from '../repository/user.repository';
import UserProfileRepository from '../repository/userProfile.repository';                           
import UserRoleRepository from '../repository/userRole.repository';
import UserService from '../services/user.service';
import { AuthRequest } from '../types/AuthRequest';
import { UserTokenPayload } from '../types/UserTokenPayload';
import { UnauthorizedError } from '../utils/errors/app.error';


const userRepository = new UserRepository();
const userProfileRepository = new UserProfileRepository();
const userRoleRepository = new UserRoleRepository();
const roleRepository = new RoleRepository();

const userService = new UserService(userRepository, userProfileRepository, roleRepository, userRoleRepository);

const authenticationMiddleware = (req : AuthRequest, _res: Response, next: NextFunction)=>{
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        logger.error('Authentication failed: No token provided');
        throw new UnauthorizedError('No token provided');
    }

    const tokenMatch = authHeader.match(/^Bearer\s+(\S+)$/i);

    if (!tokenMatch) {
        throw new UnauthorizedError('Invalid authorization header');
    }

    const decoded = userService.isAuthenticated(tokenMatch[1]);
        req.user = decoded as UserTokenPayload;
        next();
    };

export default authenticationMiddleware;