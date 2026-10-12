import { LeadNurtureStatus } from '../utils/enums/LeadNurtureStatus.enum';

/** One user's place in the nurture, as the scheduler sees it (plain data, not a Sequelize model). */
export type NurtureRow = {
    id: number
    userId: number
    signedUpAt: Date
    nextStep: number | null
    nextDueAt: Date | null
};

/** What the scheduler needs to know about the person behind a row. */
export type NurtureUser = {
    id: number
    fullName: string
    email: string
    phoneNo: string
    graduationYear: string | null
    deletedAt: Date | null
    details: string | null
    domain: string | null
};

export type NurtureAdvance = {
    status: LeadNurtureStatus
    nextStep: number | null
    nextDueAt: Date | null
    // Only set when a message was actually queued; left alone when a step is passed over.
    lastSentStep?: number
    lastSentAt?: Date
};

/** Everything the scheduler needs from the database. A row it claims stays claimed until it advances, stops or releases it. */
export interface LeadNurtureStore {
    claimDue(now: Date, limit: number, token: string, lockedUntil: Date): Promise<NurtureRow[]>
    findUsers(userIds: number[]): Promise<NurtureUser[]>
    advance(rowId: number, token: string, update: NurtureAdvance): Promise<void>
    stop(rowId: number, token: string, reason: string): Promise<void>
    release(rowId: number, token: string): Promise<void>
}

export type EngagementContact = {
    ref: string
    email: string
    phone: string
};

export type EngagementResult = {
    registered: boolean
};

export type TickSummary = {
    skipped: 'outside_window' | 'notifications_disabled' | null
    claimed: number
    queued: number
    wouldQueue: number
    stopped: number
    wouldStop: number
    completed: number
    passedOver: number
    lookupFailed: number
    enqueueFailed: number
    failed: number
};
