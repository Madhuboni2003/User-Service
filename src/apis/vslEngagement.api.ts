import { z } from 'zod';

import { vslEngagementConfig } from '../configs/server.config';
import { EngagementContact, EngagementResult } from '../types/LeadNurtureSchedule';

// The VSL accepts at most this many contacts per call (MAX_ENGAGEMENT_CONTACTS in candidate-form-details-service).
export const VSL_ENGAGEMENT_MAX_CONTACTS = 200;

const responseSchema = z.object({
    data: z.object({
        results: z.array(z.object({
            ref: z.string(),
            registered: z.boolean()
        }))
    })
});

/**
 * Asks the VSL which of these WorkR users have already registered there. Returns an answer per `ref` the VSL answered for.
 * Throws on anything other than a clean answer (not configured, network error, timeout, non-2xx, unexpected body), and the
 * caller must treat that as "cannot tell" and send nothing. Never logs the contacts or the key.
 */
export async function fetchVslEngagement(contacts: EngagementContact[]): Promise<Map<string, EngagementResult>> {
    const { BASE_URL, API_KEY, API_KEY_HEADER, TIMEOUT_MS } = vslEngagementConfig;

    if (!BASE_URL || !API_KEY) {
        throw new Error('VSL_API_BASE_URL or VSL_WORKR_API_KEY is not configured');
    }
    if (contacts.length === 0) {
        return new Map();
    }
    if (contacts.length > VSL_ENGAGEMENT_MAX_CONTACTS) {
        throw new Error(`Too many contacts for one VSL engagement call: ${contacts.length}`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(`${BASE_URL}/integrations/workr/engagement`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', [API_KEY_HEADER]: API_KEY },
            body: JSON.stringify({ contacts }),
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`VSL engagement lookup answered HTTP ${response.status}`);
        }

        const body = responseSchema.parse(await response.json());
        return new Map(body.data.results.map((result) => [result.ref, { registered: result.registered }]));
    } catch (error) {
        if (controller.signal.aborted) {
            throw new Error(`VSL engagement lookup timed out after ${TIMEOUT_MS}ms`);
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}
