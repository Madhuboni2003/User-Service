import { QueryTypes } from 'sequelize';

import LeadNurture from '../db/models/leadNurture.model';
import sequelize from '../db/models/sequelize';
import User from '../db/models/user.model';
import { LeadNurtureStore, NurtureAdvance, NurtureRow, NurtureUser } from '../types/LeadNurtureSchedule';
import { LeadNurtureStatus } from '../utils/enums/LeadNurtureStatus.enum';
import BaseRepository from './base.repository';

class LeadNurtureRepository extends BaseRepository<LeadNurture> implements LeadNurtureStore {
    constructor() {
        super(LeadNurture);
    }

    /** Creates the user's row once; calling it again for the same user changes nothing. */
    async createForSignup(userId: number, signedUpAt: Date, nextStep: number, nextDueAt: Date): Promise<boolean> {
        const [, created] = await this.model.findOrCreate({
            where: { userId },
            defaults: { userId, signedUpAt, status: LeadNurtureStatus.ACTIVE, nextStep, nextDueAt }
        });
        return created;
    }

    /**
     * Claims up to `limit` active rows that are due and not claimed by anyone else (or whose claim has expired), most overdue first.
     * One UPDATE does the claiming, so two scheduler instances can never both get the same row.
     */
    async claimDue(now: Date, limit: number, token: string, lockedUntil: Date): Promise<NurtureRow[]> {
        await sequelize.query(
            `UPDATE lead_nurtures
                SET lock_token = :token, locked_until = :lockedUntil, updated_at = :now
              WHERE status = :active
                AND next_due_at IS NOT NULL
                AND next_due_at <= :now
                AND (locked_until IS NULL OR locked_until < :now)
              ORDER BY next_due_at ASC
              LIMIT :limit`,
            { replacements: { token, lockedUntil, now, limit, active: LeadNurtureStatus.ACTIVE }, type: QueryTypes.UPDATE }
        );

        const rows = await this.model.findAll({
            where: { lockToken: token, status: LeadNurtureStatus.ACTIVE },
            order: [['nextDueAt', 'ASC']]
        });

        return rows.map((row) => ({
            id: row.id,
            userId: row.userId,
            signedUpAt: row.signedUpAt,
            nextStep: row.nextStep,
            nextDueAt: row.nextDueAt
        }));
    }

    /** The nurture rows of the given users (a user without a row is simply absent). */
    async findByUserIds(userIds: number[]): Promise<LeadNurture[]> {
        if (userIds.length === 0) {
            return [];
        }
        return this.model.findAll({
            where: { userId: userIds },
            attributes: ['userId', 'status', 'stopReason', 'nextStep', 'nextDueAt', 'lastSentStep', 'lastSentAt']
        });
    }

    async findUsers(userIds: number[]): Promise<NurtureUser[]> {
        if (userIds.length === 0) {
            return [];
        }

        const users = await User.findAll({
            where: { id: userIds },
            attributes: ['id', 'fullName', 'email', 'phoneNo', 'graduationYear', 'deletedAt'],
            include: [{ association: User.associations.profile, required: false, attributes: ['details', 'domain'] }]
        });

        return users.map((user) => ({
            id: user.id,
            fullName: user.fullName,
            email: user.email,
            phoneNo: user.phoneNo,
            graduationYear: user.graduationYear ?? null,
            deletedAt: user.deletedAt ?? null,
            details: user.profile?.details ?? null,
            domain: user.profile?.domain ?? null
        }));
    }

    // Every write below only applies while the caller still holds the claim, and gives the claim up.
    async advance(rowId: number, token: string, update: NurtureAdvance): Promise<void> {
        await this.model.update(
            { ...update, lockToken: null, lockedUntil: null },
            { where: { id: rowId, lockToken: token } }
        );
    }

    async stop(rowId: number, token: string, reason: string): Promise<void> {
        await this.model.update(
            { status: LeadNurtureStatus.STOPPED, stopReason: reason, nextStep: null, nextDueAt: null, lockToken: null, lockedUntil: null },
            { where: { id: rowId, lockToken: token } }
        );
    }

    async release(rowId: number, token: string): Promise<void> {
        await this.model.update(
            { lockToken: null, lockedUntil: null },
            { where: { id: rowId, lockToken: token } }
        );
    }
}

export default LeadNurtureRepository;
