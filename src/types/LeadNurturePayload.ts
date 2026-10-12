import { NotificationChannel } from '../utils/enums/NotificationChannel.enum';

/**
 * Job payload for notification-service's `workr-signup-notification-queue`.
 * Field names follow the other notification-service payloads (candidateName, candidateEmail,
 * candidatePhone, subject, channels, templateKeys) so the consumer can treat them alike.
 */
export type LeadNurturePayload = {
    /** WorkR user id (the consumer derives its idempotency key from it) */
    userId: number
    /** Which message this is: 0 / absent = the signup (Day 0) message, otherwise the nurture day (2, 4, 7, ...). Part of the consumer's idempotency key. */
    step?: number
    candidateName: string
    candidateEmail: string
    /** E.164 (+91XXXXXXXXXX); empty string when the number is not a valid 10-digit Indian mobile */
    candidatePhone: string
    readinessLink: string
    subject: string
    channels: NotificationChannel[]
    /** Template per requested channel (a channel that is not requested needs none) */
    templateKeys: Partial<Record<NotificationChannel, string>>
    details: string
    domain: string | null
    graduationYear: string | null
    signedUpAt: string
};

export type WorkrSignupInput = {
    userId: number
    fullName: string
    email: string
    phoneNo: string
    details?: string | null
    domain?: string | null
    graduationYear?: string | null
    signedUpAt?: Date
};
