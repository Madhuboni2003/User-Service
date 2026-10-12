import { NotificationChannel } from '../utils/enums/NotificationChannel.enum';

/**
 * The WorkR nurture after the Day 0 readiness check: one entry per day. The scheduler walks this list in day order.
 * Template keys are file names in notification-service (src/templates/email/{html,text}).
 */
export type NurtureStep = {
    day: number
    // A disabled step is left out of the sequence entirely (nobody receives it, nobody waits for it).
    enabled: boolean
    // Becomes utm_content on the readiness link, so the VSL can tell which message brought the visit.
    utmContent: string
    subject: string
    channels: NotificationChannel[]
    templateKeys: Partial<Record<NotificationChannel, string>>
}

export const NURTURE_STEPS: readonly NurtureStep[] = [
    {
        day: 2,
        enabled: true,
        utmContent: 'workr_d02_reframe',
        subject: 'Applying to more jobs may not fix the problem',
        channels: [NotificationChannel.EMAIL],
        templateKeys: { [NotificationChannel.EMAIL]: 'ReframeWorkr' }
    },
    {
        day: 4,
        enabled: true,
        utmContent: 'workr_d04_abhinay',
        subject: 'He wasn\'t getting interviews — what changed',
        channels: [NotificationChannel.EMAIL],
        templateKeys: { [NotificationChannel.EMAIL]: 'AbhinayProofWorkr' }
    },
    {
        // WhatsApp nudge. The template key is the AiSensy campaign name.
        day: 5,
        enabled: true,
        utmContent: 'workr_d05_whatsapp',
        subject: 'WorkR nurture Day 5 (WhatsApp)',
        channels: [NotificationChannel.WHATSAPP],
        templateKeys: { [NotificationChannel.WHATSAPP]: 'AbhinayProofWorkrWA' }
    },
    {
        day: 7,
        enabled: true,
        utmContent: 'workr_d07_subhadip',
        subject: 'Why preparation alone wasn\'t enough for him',
        channels: [NotificationChannel.EMAIL],
        templateKeys: { [NotificationChannel.EMAIL]: 'SubhadipProofWorkr' }
    },
    {
        day: 10,
        enabled: true,
        utmContent: 'workr_d10_decision',
        subject: 'Should you be trying to switch right now?',
        channels: [NotificationChannel.EMAIL],
        templateKeys: { [NotificationChannel.EMAIL]: 'DecisionFramingWorkr' }
    },
    {
        // WhatsApp nudge. The template key is the AiSensy campaign name.
        day: 12,
        enabled: true,
        utmContent: 'workr_d12_whatsapp',
        subject: 'WorkR nurture Day 12 (WhatsApp)',
        channels: [NotificationChannel.WHATSAPP],
        templateKeys: { [NotificationChannel.WHATSAPP]: 'ReadinessAccessWorkrWA' }
    },
    {
        day: 15,
        enabled: true,
        utmContent: 'workr_d15_close',
        subject: 'I\'ll leave this with you',
        channels: [NotificationChannel.EMAIL],
        templateKeys: { [NotificationChannel.EMAIL]: 'CloseActiveNurtureWorkr' }
    }
];

/** The enabled step with the lowest day that is >= `day`, or null when none is left. */
export function firstEnabledStepFrom(day: number, steps: readonly NurtureStep[] = NURTURE_STEPS): NurtureStep | null {
    return steps.filter((step) => step.enabled && step.day >= day).sort((a, b) => a.day - b.day)[0] ?? null;
}

/** The enabled step that follows `day`, or null when `day` was the last one. */
export function nextEnabledStepAfter(day: number, steps: readonly NurtureStep[] = NURTURE_STEPS): NurtureStep | null {
    return firstEnabledStepFrom(day + 1, steps);
}

/** Fails at startup, not at 11:00 on a send day, if an enabled step cannot be sent. */
export function assertStepCatalogue(steps: readonly NurtureStep[] = NURTURE_STEPS): void {
    const days = new Set<number>();
    for (const step of steps) {
        if (!Number.isInteger(step.day) || step.day <= 0 || days.has(step.day)) {
            throw new Error(`Lead nurture step day ${step.day} is invalid or duplicated`);
        }
        days.add(step.day);

        if (!step.enabled) {
            continue;
        }
        if (step.channels.length === 0 || !step.subject.trim() || !step.utmContent.trim()) {
            throw new Error(`Lead nurture step day ${step.day} is missing channels, subject or utmContent`);
        }
        for (const channel of step.channels) {
            if (!step.templateKeys[channel]) {
                throw new Error(`Lead nurture step day ${step.day} has no template key for ${channel}`);
            }
        }
    }
}
