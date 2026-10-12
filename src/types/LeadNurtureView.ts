import { LeadNurtureStatus } from '../utils/enums/LeadNurtureStatus.enum';
import { NotificationChannel } from '../utils/enums/NotificationChannel.enum';

/**
 * Where one message of the sequence stands for one person.
 * sent = handed to the sending service (delivery itself is tracked there), next = due next, upcoming = still to come,
 * skipped = never goes to this person (a WhatsApp step without a usable number, or a step added after they joined),
 * stopped = not sent because the sequence ended early.
 */
export type NurtureStepState = 'sent' | 'next' | 'upcoming' | 'skipped' | 'stopped';

/**
 * What the sending service (notification-service) reports for one channel of a message that was handed to it:
 * sent = the provider (SES / AiSensy) accepted it, failed = the provider refused it or sending gave up,
 * processing = the sending service is still working on it, queued = no delivery record yet (still waiting in the queue).
 */
export type DeliveryStatus = 'sent' | 'failed' | 'processing' | 'queued';

export type StepDelivery = {
    channel: NotificationChannel
    status: DeliveryStatus
    failedReason: string | null
    // ISO time the provider accepted it (sent) or it failed; null while still processing or queued
    at: string | null
};

export type NurtureStepView = {
    // 0 is the signup message, then the nurture days
    day: number
    channels: NotificationChannel[]
    state: NurtureStepState
    // One entry per channel, only for a step that was handed over and only when the sending service answered; else empty.
    deliveries: StepDelivery[]
    // Worst result across the channels: failed, else still in progress, else sent. null when unknown or not handed over yet.
    delivery: DeliveryStatus | null
};

/** What the admin candidates list shows about one person's nurture. */
export type NurtureView = {
    // false when the person has no nurture row: signed up before the nurture existed, or is not a working professional
    inSequence: boolean
    status: LeadNurtureStatus | null
    stopReason: string | null
    nextStep: number | null
    nextDueAt: string | null
    lastSentStep: number | null
    lastSentAt: string | null
    // false when the sending service could not be asked (not configured, down, timed out): deliveries are then unknown.
    deliveryChecked: boolean
    steps: NurtureStepView[]
};

/** The columns of a lead_nurtures row that the view needs. */
export type NurtureStatusRow = {
    status: LeadNurtureStatus
    stopReason: string | null
    nextStep: number | null
    nextDueAt: Date | null
    lastSentStep: number | null
    lastSentAt: Date | null
};
