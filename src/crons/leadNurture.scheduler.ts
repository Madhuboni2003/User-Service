import cron, { ScheduledTask } from 'node-cron';

import logger from '../configs/logger.config';
import { leadNurtureSchedulerConfig } from '../configs/server.config';
import { assertStepCatalogue } from '../constants/leadNurtureSteps';
import { createLeadNurtureScheduler } from '../services/leadNurtureScheduler.service';

let task: ScheduledTask | null = null;

// Every `tickMinutes` minutes between startHour:00 and endHour-1:55, e.g. 15, 9, 19 gives every 15 minutes during hours 9 to 18 IST (the end hour is exclusive).
export const buildLeadNurtureCronExpression = (tickMinutes: number, startHour: number, endHour: number): string => {
    if (!Number.isInteger(tickMinutes) || tickMinutes < 1 || tickMinutes > 60 || 60 % tickMinutes !== 0) {
        throw new Error(`LEAD_NURTURE_TICK_MINUTES must divide 60, got ${tickMinutes}`);
    }
    if (!Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour < 0 || endHour > 24 || endHour <= startHour) {
        throw new Error(`Lead nurture window ${startHour}-${endHour} is invalid`);
    }
    return `*/${tickMinutes} ${startHour}-${endHour - 1} * * *`;
};

/**
 * Starts the Day 2..Day 15 nurture runner as a cron job on the clock, in IST, only inside the send window.
 * Does nothing unless LEAD_NURTURE_SCHEDULER_ENABLED=true. Safe to run in several processes: ticks claim rows in the database.
 */
export const startLeadNurtureScheduler = (): void => {
    const { ENABLED, DRY_RUN, TICK_MINUTES, WINDOW_START_HOUR_IST, WINDOW_END_HOUR_IST } = leadNurtureSchedulerConfig;

    if (!ENABLED) {
        logger.info('Lead nurture scheduler is off (LEAD_NURTURE_SCHEDULER_ENABLED is not true)');
        return;
    }
    if (task) {
        return;
    }

    assertStepCatalogue();
    const expression = buildLeadNurtureCronExpression(TICK_MINUTES, WINDOW_START_HOUR_IST, WINDOW_END_HOUR_IST);
    if (!cron.validate(expression)) {
        throw new Error(`Lead nurture cron expression is invalid: ${expression}`);
    }

    const scheduler = createLeadNurtureScheduler();
    let running = false;

    task = cron.schedule(expression, async () => {
        // A tick that is still running (slow VSL, big batch) is never joined by the next one.
        if (running) {
            return;
        }
        running = true;
        try {
            const summary = await scheduler.tick();
            if (summary.claimed > 0 || summary.skipped === 'notifications_disabled') {
                logger.info('Lead nurture tick finished', { dryRun: DRY_RUN, ...summary });
            }
        } catch (error) {
            logger.error('Lead nurture tick crashed', { message: error instanceof Error ? error.message : String(error) });
        } finally {
            running = false;
        }
    }, { timezone: 'Asia/Kolkata' });

    logger.info('Lead nurture scheduler started', { dryRun: DRY_RUN, cron: expression, timezone: 'Asia/Kolkata' });
};

export const stopLeadNurtureScheduler = async (): Promise<void> => {
    if (task) {
        await task.stop();
        task = null;
    }
};
