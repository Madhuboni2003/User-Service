import { QueryTypes } from 'sequelize';

import LeadNurture from '../db/models/leadNurture.model';
import sequelize from '../db/models/sequelize';
import User from '../db/models/user.model';
import { LeadNurtureStore, NurtureAdvance, NurtureRow, NurtureUser } from '../types/LeadNurtureSchedule';
import { NurtureLeadFilters, NurtureLeadRow, NurtureSummaryRow } from '../types/NurtureLeads';
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

    /**
     * Working professionals in the nurture, joined with their user and profile, for the admin "leads by day" list.
     * Deleted accounts are left out. `match` decides how the day is compared with the step they last received.
     */
    async findLeadsForDay(filters: NurtureLeadFilters): Promise<NurtureLeadRow[]> {
        const conditions = [
            'u.deleted_at IS NULL',
            'LOWER(TRIM(up.details)) = \'working professional\'',
            // People whose sequence was stopped (e.g. they registered on the VSL) are never part of these lists.
            'ln.status <> \'stopped\''
        ];
        const replacements: Record<string, string | number> = { day: filters.day };

        if (filters.match === 'reached') {
            conditions.push('ln.last_sent_step >= :day');
        } else if (filters.match === 'exact') {
            conditions.push('ln.last_sent_step = :day');
        } else {
            conditions.push('ln.status = \'active\'', 'ln.next_step = :day');
        }
        if (filters.status) {
            conditions.push('ln.status = :status');
            replacements.status = filters.status;
        }
        if (filters.search) {
            conditions.push('(u.full_name LIKE :search OR u.email LIKE :search OR u.phone_no LIKE :search)');
            replacements.search = `%${filters.search.replace(/[\\%_]/g, '\\$&')}%`;
        }

        const orderBy = filters.match === 'next' ? 'ln.next_due_at ASC, ln.id ASC' : 'ln.last_sent_at DESC, ln.id DESC';

        const rows = await sequelize.query<NurtureLeadRow>(
            `SELECT u.id AS userId, u.full_name AS fullName, u.email AS email, u.phone_no AS phoneNo,
                    u.graduation_year AS graduationYear,
                    up.current_company AS currentCompany, up.current_ctc AS currentCtc, up.domain AS domain,
                    up.years_of_experience AS yearsOfExperience,
                    ln.signed_up_at AS signedUpAt, ln.status AS status, ln.stop_reason AS stopReason,
                    ln.last_sent_step AS lastSentStep, ln.last_sent_at AS lastSentAt,
                    ln.next_step AS nextStep, ln.next_due_at AS nextDueAt
               FROM lead_nurtures ln
               JOIN users u ON u.id = ln.user_id
               JOIN user_profiles up ON up.user_id = u.id
              WHERE ${conditions.join(' AND ')}
              ORDER BY ${orderBy}`,
            { replacements, type: QueryTypes.SELECT }
        );

        return rows.map((row) => ({ ...row, userId: Number(row.userId) }));
    }

    /** Light version of findLeadsForDay for the per-day counts: the same people (working professionals, not deleted, sequence not stopped), optionally of one status. */
    async findRowsForSummary(status?: 'active' | 'completed'): Promise<NurtureSummaryRow[]> {
        const rows = await sequelize.query<NurtureSummaryRow>(
            `SELECT u.phone_no AS phoneNo, ln.status AS status, ln.last_sent_step AS lastSentStep, ln.next_step AS nextStep
               FROM lead_nurtures ln
               JOIN users u ON u.id = ln.user_id
               JOIN user_profiles up ON up.user_id = u.id
              WHERE u.deleted_at IS NULL
                AND LOWER(TRIM(up.details)) = 'working professional'
                AND ln.status <> 'stopped'
                ${status ? 'AND ln.status = :status' : ''}`,
            { replacements: status ? { status } : {}, type: QueryTypes.SELECT }
        );

        return rows.map((row) => ({
            ...row,
            lastSentStep: row.lastSentStep == null ? null : Number(row.lastSentStep),
            nextStep: row.nextStep == null ? null : Number(row.nextStep)
        }));
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
