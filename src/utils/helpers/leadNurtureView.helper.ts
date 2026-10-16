import { NURTURE_STEPS, NurtureStep } from '../../constants/leadNurtureSteps';
import { DeliveryStatus, NurtureStatusRow, NurtureStepState, NurtureStepView, NurtureView, StepDelivery } from '../../types/LeadNurtureView';
import { WorkrDelivery } from '../../types/WorkrDelivery';
import { LeadNurtureStatus } from '../enums/LeadNurtureStatus.enum';
import { NotificationChannel } from '../enums/NotificationChannel.enum';
import { toE164Phone } from './leadNurture.helper';

const EMPTY_VIEW: NurtureView = {
    inSequence: false,
    status: null,
    stopReason: null,
    nextStep: null,
    nextDueAt: null,
    lastSentStep: null,
    lastSentAt: null,
    deliveryChecked: false,
    steps: []
};

/**
 * Turns a person's lead_nurtures row into what the admin list shows: the overall state plus the state of every message.
 * Without a row the person is simply not in the sequence.
 */
export function buildNurtureView(row: NurtureStatusRow | null, phoneNo: string, steps: readonly NurtureStep[] = NURTURE_STEPS): NurtureView {
    if (!row) {
        return { ...EMPTY_VIEW, steps: [] };
    }

    const hasPhone = toE164Phone(phoneNo) !== null;
    const lastSent = row.lastSentStep ?? 0;

    // The row is created right after the signup message is queued, so a row means Day 0 went out.
    const stepViews: NurtureStepView[] = [{
        day: 0,
        channels: hasPhone ? [NotificationChannel.EMAIL, NotificationChannel.WHATSAPP] : [NotificationChannel.EMAIL],
        state: 'sent',
        deliveries: [],
        delivery: null
    }];

    for (const step of [...steps].filter((candidate) => candidate.enabled).sort((a, b) => a.day - b.day)) {
        // A channel that cannot be used for this person (WhatsApp without a valid number) is left out of the step.
        const channels = usableChannels(step, phoneNo);
        stepViews.push({ day: step.day, channels, state: stateOf(step.day, channels.length, row, lastSent), deliveries: [], delivery: null });
    }

    return {
        inSequence: true,
        status: row.status,
        stopReason: row.stopReason,
        nextStep: row.nextStep,
        nextDueAt: row.nextDueAt ? row.nextDueAt.toISOString() : null,
        lastSentStep: row.lastSentStep,
        lastSentAt: row.lastSentAt ? row.lastSentAt.toISOString() : null,
        deliveryChecked: false,
        steps: stepViews
    };
}

/** The channels of a step that can reach this person: a WhatsApp channel needs a valid Indian mobile number. */
export function usableChannels(step: NurtureStep, phoneNo: string): NotificationChannel[] {
    const hasPhone = toE164Phone(phoneNo) !== null;
    return step.channels.filter((channel) => channel !== NotificationChannel.WHATSAPP || hasPhone);
}

function stateOf(day: number, usableChannels: number, row: NurtureStatusRow, lastSent: number): NurtureStepState {
    if (usableChannels === 0) {
        return 'skipped';
    }
    if (day <= lastSent) {
        return 'sent';
    }

    switch (row.status) {
    case LeadNurtureStatus.ACTIVE:
        if (row.nextStep === null || day > row.nextStep) {
            return 'upcoming';
        }
        return day === row.nextStep ? 'next' : 'skipped';
    case LeadNurtureStatus.STOPPED:
        return 'stopped';
    default:
        // completed: whatever was never sent was passed over
        return 'skipped';
    }
}

/**
 * Adds what the sending service reported to a view built from the lead_nurtures row. `deliveries` are the records of this
 * one person. Only steps that were handed over get a result; a handed-over channel with no record yet is still queued.
 */
export function attachDeliveries(view: NurtureView, deliveries: readonly WorkrDelivery[]): NurtureView {
    if (!view.inSequence) {
        return view;
    }

    const steps = view.steps.map((step): NurtureStepView => {
        if (step.state !== 'sent') {
            return step;
        }

        const results = deliveryResultsForStep(step.day, step.channels, deliveries);

        return { ...step, deliveries: results, delivery: worstDelivery(results) };
    });

    return { ...view, deliveryChecked: true, steps };
}

/**
 * What the sending service reported for each channel of one step that was handed over. `deliveries` are the records of one
 * person. A channel with no record yet is still queued.
 */
export function deliveryResultsForStep(day: number, channels: readonly NotificationChannel[], deliveries: readonly WorkrDelivery[]): StepDelivery[] {
    return channels.map((channel): StepDelivery => {
        const record = deliveries.find((delivery) => delivery.step === day && delivery.channel === channel);

        if (!record) {
            return { channel, status: 'queued', failedReason: null, at: null };
        }
        return {
            channel,
            status: record.sendStatus,
            failedReason: record.sendStatus === 'failed' ? record.failedReason : null,
            at: record.sendStatus === 'failed' ? record.failedAt : record.submittedAt
        };
    });
}

/** Worst result across the channels: failed, else still in progress, else sent. null when there are no channels. */
export function worstDelivery(results: readonly StepDelivery[]): DeliveryStatus | null {
    return worstOf(results.map((result) => result.status));
}

function worstOf(statuses: DeliveryStatus[]): DeliveryStatus | null {
    if (statuses.length === 0) {
        return null;
    }
    if (statuses.includes('failed')) {
        return 'failed';
    }
    if (statuses.includes('processing')) {
        return 'processing';
    }
    if (statuses.includes('queued')) {
        return 'queued';
    }
    return 'sent';
}
