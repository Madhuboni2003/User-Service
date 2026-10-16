import { NotificationChannel } from '../utils/enums/NotificationChannel.enum';
import { DeliveryStatus, StepDelivery } from './LeadNurtureView';

/**
 * Which people to return for a nurture day:
 * reached = the day's message was handed over (the sequence is at that day or beyond),
 * exact = the day's message is the latest one they got, next = the day's message is the one due next.
 */
export type NurtureLeadMatch = 'reached' | 'exact' | 'next';

export type NurtureLeadFilters = {
    day: number
    match: NurtureLeadMatch
    // Stopped sequences are never returned; this narrows to one of the other two
    status?: 'active' | 'completed'
    // Part of the name, email or phone number
    search?: string
    // Only people whose message for `day` has this delivery result (needs the notification-service)
    delivery?: DeliveryStatus
};

/** The few columns the per-day counts need, one per working professional in the nurture. */
export type NurtureSummaryRow = {
    phoneNo: string
    status: 'active' | 'completed' | 'stopped'
    lastSentStep: number | null
    nextStep: number | null
};

/** How many people sit at one nurture day, by each way of matching it (see NurtureLeadMatch). */
export type NurtureDaySummary = {
    day: number
    channels: NotificationChannel[]
    reached: number
    exact: number
    next: number
};

/** One working professional's nurture row joined with their user and profile. */
export type NurtureLeadRow = {
    userId: number
    fullName: string
    email: string
    phoneNo: string
    graduationYear: string | null
    currentCompany: string | null
    currentCtc: string | null
    domain: string | null
    yearsOfExperience: number | null
    signedUpAt: Date
    status: 'active' | 'completed' | 'stopped'
    stopReason: string | null
    lastSentStep: number | null
    lastSentAt: Date | null
    nextStep: number | null
    nextDueAt: Date | null
};

export type NurtureLead = NurtureLeadRow & {
    // The nurture day this list was asked about, and the channels that day goes out on for this person
    day: number
    channels: NotificationChannel[]
    // What the notification-service says about that day's message. Empty and null when it was not handed over or could not be asked.
    deliveries: StepDelivery[]
    delivery: DeliveryStatus | null
};
