import { z } from 'zod';

import { NURTURE_STEPS } from '../constants/leadNurtureSteps';

const enabledDays = NURTURE_STEPS.filter((step) => step.enabled).map((step) => step.day);

export const MAX_NURTURE_LEADS_PAGE_SIZE = 200;

const optionalText = z.string().trim().min(1).max(100).optional();

export const nurtureLeadsQuerySchema = z.object({
    day: z.coerce.number({ invalid_type_error: `day is required: one of ${enabledDays.join(', ')}` }).int().refine((day) => enabledDays.includes(day), { message: `day must be one of ${enabledDays.join(', ')}` }),
    match: z.enum(['reached', 'exact', 'next']).default('reached'),
    // Sequences that were stopped are never listed, so "stopped" is not an option
    status: z.enum(['active', 'completed']).optional(),
    search: optionalText,
    delivery: z.enum(['sent', 'failed', 'processing', 'queued']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_NURTURE_LEADS_PAGE_SIZE).default(20),
    format: z.enum(['json', 'csv']).default('json')
}).refine((query) => !(query.delivery && query.match === 'next'), {
    message: 'delivery cannot be combined with match=next: that message has not been sent yet',
    path: ['delivery']
});

export const nurtureLeadsSummaryQuerySchema = z.object({
    status: z.enum(['active', 'completed']).optional()
});

export type NurtureLeadsQuery = z.infer<typeof nurtureLeadsQuerySchema>;
