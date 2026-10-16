import { z } from 'zod';

import { notificationLookupConfig } from '../configs/server.config';
import { WorkrDelivery } from '../types/WorkrDelivery';
import { NotificationChannel } from '../utils/enums/NotificationChannel.enum';

// notification-service accepts at most this many user ids per call (MAX_WORKR_LOOKUP_USER_IDS there).
export const NOTIFICATION_LOOKUP_MAX_USER_IDS = 100;

const responseSchema = z.object({
    data: z.object({
        deliveries: z.array(z.object({
            userId: z.number().int(),
            step: z.number().int(),
            channel: z.nativeEnum(NotificationChannel),
            sendStatus: z.enum(['PROCESSING', 'SENT', 'FAILED']),
            failedReason: z.string().nullable(),
            submittedAt: z.string().nullable(),
            failedAt: z.string().nullable()
        }))
    })
});

const STATUS = { PROCESSING: 'processing', SENT: 'sent', FAILED: 'failed' } as const;

/** True when the User-Service is set up to ask the notification-service for delivery results. */
export function isDeliveryLookupConfigured(): boolean {
    return Boolean(notificationLookupConfig.BASE_URL && notificationLookupConfig.API_KEY);
}

/**
 * Asks the notification-service what became of the messages it was handed for these WorkR users.
 * Throws on anything other than a clean answer (not configured, network error, timeout, non-2xx, unexpected body); the caller
 * shows "delivery unknown" in that case. Never logs the key.
 */
export async function fetchWorkrDeliveries(userIds: number[]): Promise<WorkrDelivery[]> {
    const { BASE_URL, API_KEY, API_KEY_HEADER, TIMEOUT_MS } = notificationLookupConfig;

    if (!isDeliveryLookupConfigured()) {
        throw new Error('NOTIFICATION_SERVICE_BASE_URL or NOTIFICATION_LOOKUP_API_KEY is not configured');
    }
    if (userIds.length === 0) {
        return [];
    }
    if (userIds.length > NOTIFICATION_LOOKUP_MAX_USER_IDS) {
        throw new Error(`Too many users for one delivery lookup: ${userIds.length}`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(`${BASE_URL}/internal/workr/deliveries`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', [API_KEY_HEADER]: API_KEY },
            body: JSON.stringify({ userIds }),
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`Delivery lookup answered HTTP ${response.status}`);
        }

        const body = responseSchema.parse(await response.json());
        return body.data.deliveries.map((delivery) => ({ ...delivery, sendStatus: STATUS[delivery.sendStatus] }));
    } catch (error) {
        if (controller.signal.aborted) {
            throw new Error(`Delivery lookup timed out after ${TIMEOUT_MS}ms`);
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Delivery records of many users, keyed by user id (every asked id is present, possibly with an empty list). Asks in chunks of
 * NOTIFICATION_LOOKUP_MAX_USER_IDS and throws, like fetchWorkrDeliveries, if any chunk cannot be answered.
 */
export async function fetchWorkrDeliveriesByUser(userIds: number[]): Promise<Map<number, WorkrDelivery[]>> {
    const byUser = new Map<number, WorkrDelivery[]>(userIds.map((userId) => [userId, []]));

    for (let start = 0; start < userIds.length; start += NOTIFICATION_LOOKUP_MAX_USER_IDS) {
        const chunk = userIds.slice(start, start + NOTIFICATION_LOOKUP_MAX_USER_IDS);
        for (const delivery of await fetchWorkrDeliveries(chunk)) {
            byUser.get(delivery.userId)?.push(delivery);
        }
    }

    return byUser;
}
