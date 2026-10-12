import { randomUUID } from 'node:crypto';

import { fetchVslEngagement } from '../apis/vslEngagement.api';
import logger from '../configs/logger.config';
import { leadNurtureSchedulerConfig, notificationConfig } from '../configs/server.config';
import { firstEnabledStepFrom, nextEnabledStepAfter,NurtureStep } from '../constants/leadNurtureSteps';
import { enqueueLeadNurture } from '../producers/leadNurture.producer';
import LeadNurtureRepository from '../repository/leadNurture.repository';
import { LeadNurturePayload } from '../types/LeadNurturePayload';
import { EngagementContact, EngagementResult, LeadNurtureStore, NurtureRow, NurtureUser, TickSummary } from '../types/LeadNurtureSchedule';
import { LeadNurtureStatus, LeadNurtureStopReason } from '../utils/enums/LeadNurtureStatus.enum';
import { NotificationChannel } from '../utils/enums/NotificationChannel.enum';
import { buildReadinessLink, toE164Phone } from '../utils/helpers/leadNurture.helper';
import { dueAtForDay, isWithinSendWindow, nextDaySendSlot } from '../utils/helpers/leadNurtureSchedule.helper';

type SchedulerConfig = Pick<typeof leadNurtureSchedulerConfig,
    'DRY_RUN' | 'BATCH_SIZE' | 'LOCK_MS' | 'WINDOW_START_HOUR_IST' | 'WINDOW_END_HOUR_IST' | 'SEND_HOUR_IST'>;

export type LeadNurtureSchedulerDeps = {
    store: LeadNurtureStore
    fetchEngagement: (contacts: EngagementContact[]) => Promise<Map<string, EngagementResult>>
    enqueue: (payload: LeadNurturePayload, jobId: string) => Promise<boolean>
    buildLink: (utmContent: string) => string
    notificationsEnabled: () => boolean
    config: SchedulerConfig
};

const emptySummary = (): TickSummary => ({
    skipped: null, claimed: 0, queued: 0, wouldQueue: 0, stopped: 0, wouldStop: 0,
    completed: 0, passedOver: 0, lookupFailed: 0, enqueueFailed: 0, failed: 0
});

/**
 * Sends the WorkR nurture days (2, 4, 7, 10, 15) to people who have not come to the VSL.
 *
 * One tick: claim the rows that are due, ask the VSL who has already registered, then for each row either stop it (registered)
 * or queue its step and move it on. If anything cannot be confirmed (VSL unreachable, user data missing, Redis down) the row is
 * left exactly as it was and tried again on the next tick, so the failure mode is "late", never "sent to someone who should not get it".
 */
export class LeadNurtureSchedulerService {
    constructor(private readonly deps: LeadNurtureSchedulerDeps) {}

    async tick(now: Date = new Date()): Promise<TickSummary> {
        const { config, store } = this.deps;
        const summary = emptySummary();

        if (!this.deps.notificationsEnabled()) {
            summary.skipped = 'notifications_disabled';
            return summary;
        }
        if (!isWithinSendWindow(now, config.WINDOW_START_HOUR_IST, config.WINDOW_END_HOUR_IST)) {
            summary.skipped = 'outside_window';
            return summary;
        }

        const token = randomUUID();
        const rows = await store.claimDue(now, config.BATCH_SIZE, token, new Date(now.getTime() + config.LOCK_MS));
        summary.claimed = rows.length;
        if (rows.length === 0) {
            return summary;
        }

        // From here every claimed row must end in advance, stop or release; the finally block releases whatever is left.
        const unsettled = new Map(rows.map((row) => [row.id, row]));
        const settle = (row: NurtureRow) => unsettled.delete(row.id);

        try {
            const users = new Map((await store.findUsers(rows.map((row) => row.userId))).map((user) => [user.id, user]));

            const live: Array<{ row: NurtureRow, user: NurtureUser }> = [];
            for (const row of rows) {
                const user = users.get(row.userId);
                if (!user || user.deletedAt) {
                    await this.stopRow(row, token, LeadNurtureStopReason.USER_DELETED, summary);
                    settle(row);
                    continue;
                }
                live.push({ row, user });
            }

            if (live.length === 0) {
                return summary;
            }

            let engagement: Map<string, EngagementResult>;
            try {
                engagement = await this.deps.fetchEngagement(
                    live.map(({ user }) => ({ ref: String(user.id), email: user.email, phone: user.phoneNo }))
                );
            } catch (error) {
                summary.lookupFailed = live.length;
                logger.error('Lead nurture: VSL engagement lookup failed, nothing sent this tick', {
                    rows: live.length,
                    message: error instanceof Error ? error.message : String(error)
                });
                return summary;
            }

            for (const { row, user } of live) {
                try {
                    await this.processRow(row, user, engagement.get(String(user.id)), token, now, summary);
                    settle(row);
                } catch (error) {
                    summary.failed++;
                    logger.error('Lead nurture: row failed, left for the next tick', {
                        userId: row.userId,
                        message: error instanceof Error ? error.message : String(error)
                    });
                }
            }

            return summary;
        } finally {
            for (const row of unsettled.values()) {
                await store.release(row.id, token).catch((error) => {
                    logger.error('Lead nurture: could not release a row', {
                        userId: row.userId,
                        message: error instanceof Error ? error.message : String(error)
                    });
                });
            }
        }
    }

    private async processRow(
        row: NurtureRow,
        user: NurtureUser,
        engagement: EngagementResult | undefined,
        token: string,
        now: Date,
        summary: TickSummary
    ): Promise<void> {
        const { store, config } = this.deps;

        // No answer for this user means we cannot tell whether they registered, so we do not send.
        if (!engagement) {
            summary.lookupFailed++;
            await store.release(row.id, token);
            return;
        }

        if (engagement.registered) {
            await this.stopRow(row, token, LeadNurtureStopReason.VSL_REGISTERED, summary);
            return;
        }

        const step = firstEnabledStepFrom(row.nextStep ?? 0);
        if (!step) {
            // Nothing enabled is left (a step was switched off after this row was scheduled).
            summary.completed++;
            if (!config.DRY_RUN) {
                await store.advance(row.id, token, { status: LeadNurtureStatus.COMPLETED, nextStep: null, nextDueAt: null });
            } else {
                await store.release(row.id, token);
            }
            return;
        }

        const payload = this.buildPayload(row, user, step);

        // A WhatsApp-only step for someone without a usable number has nothing to send: pass over it.
        if (!payload) {
            summary.passedOver++;
            logger.info('Lead nurture: step passed over, no usable channel', { userId: row.userId, step: step.day, dryRun: config.DRY_RUN });
            if (config.DRY_RUN) {
                await store.release(row.id, token);
                return;
            }
            await this.moveOn(row, token, step, now, summary, false);
            return;
        }

        if (config.DRY_RUN) {
            summary.wouldQueue++;
            logger.info('Lead nurture DRY RUN: would send', { userId: row.userId, step: step.day, channels: payload.channels });
            await store.release(row.id, token);
            return;
        }

        const queued = await this.deps.enqueue(payload, `workr-nurture-${row.userId}-d${step.day}`);
        if (!queued) {
            summary.enqueueFailed++;
            await store.release(row.id, token);
            return;
        }

        summary.queued++;
        await this.moveOn(row, token, step, now, summary, true);
    }

    // Points the row at the next enabled step, or completes it. The next step is never due before tomorrow's send time,
    // so a user who has fallen behind (downtime) gets at most one message per day instead of several at once.
    private async moveOn(row: NurtureRow, token: string, sent: NurtureStep, now: Date, summary: TickSummary, wasSent: boolean): Promise<void> {
        const { store, config } = this.deps;
        const next = nextEnabledStepAfter(sent.day);
        const sentFields = wasSent ? { lastSentStep: sent.day, lastSentAt: now } : {};

        if (!next) {
            summary.completed++;
            await store.advance(row.id, token, { status: LeadNurtureStatus.COMPLETED, nextStep: null, nextDueAt: null, ...sentFields });
            return;
        }

        const nominal = dueAtForDay(row.signedUpAt, next.day, config.SEND_HOUR_IST);
        const earliest = nextDaySendSlot(now, config.SEND_HOUR_IST);
        const nextDueAt = nominal.getTime() > earliest.getTime() ? nominal : earliest;
        await store.advance(row.id, token, { status: LeadNurtureStatus.ACTIVE, nextStep: next.day, nextDueAt, ...sentFields });
    }

    private async stopRow(row: NurtureRow, token: string, reason: LeadNurtureStopReason, summary: TickSummary): Promise<void> {
        if (this.deps.config.DRY_RUN) {
            summary.wouldStop++;
            logger.info('Lead nurture DRY RUN: would stop', { userId: row.userId, reason });
            await this.deps.store.release(row.id, token);
            return;
        }

        summary.stopped++;
        logger.info('Lead nurture: sequence stopped', { userId: row.userId, reason });
        await this.deps.store.stop(row.id, token, reason);
    }

    private buildPayload(row: NurtureRow, user: NurtureUser, step: NurtureStep): LeadNurturePayload | null {
        const phone = toE164Phone(user.phoneNo);
        // WhatsApp needs a usable number; without one only the other channels of the step are sent.
        const channels = step.channels.filter((channel) => channel !== NotificationChannel.WHATSAPP || phone);
        if (channels.length === 0) {
            return null;
        }

        return {
            userId: user.id,
            step: step.day,
            candidateName: user.fullName.trim(),
            candidateEmail: user.email,
            candidatePhone: phone ?? '',
            readinessLink: this.deps.buildLink(step.utmContent),
            subject: step.subject,
            channels,
            templateKeys: step.templateKeys,
            details: user.details ?? '',
            domain: user.domain,
            graduationYear: user.graduationYear,
            signedUpAt: row.signedUpAt.toISOString()
        };
    }
}

export const createLeadNurtureScheduler = (): LeadNurtureSchedulerService => new LeadNurtureSchedulerService({
    store: new LeadNurtureRepository(),
    fetchEngagement: fetchVslEngagement,
    enqueue: enqueueLeadNurture,
    buildLink: buildReadinessLink,
    notificationsEnabled: () => notificationConfig.NOTIFICATIONS_ENABLED,
    config: leadNurtureSchedulerConfig
});
