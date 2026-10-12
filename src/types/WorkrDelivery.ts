import { NotificationChannel } from '../utils/enums/NotificationChannel.enum';

/** One delivery (one channel of one step) of one WorkR user, as notification-service reports it. */
export type WorkrDelivery = {
    userId: number
    // 0 = signup message, then the nurture day
    step: number
    channel: NotificationChannel
    sendStatus: 'sent' | 'failed' | 'processing'
    failedReason: string | null
    submittedAt: string | null
    failedAt: string | null
};
