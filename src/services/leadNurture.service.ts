import logger from '../configs/logger.config';
import { leadNurtureSchedulerConfig, notificationConfig } from '../configs/server.config';
import { firstEnabledStepFrom } from '../constants/leadNurtureSteps';
import { enqueueLeadNurture } from '../producers/leadNurture.producer';
import LeadNurtureRepository from '../repository/leadNurture.repository';
import { LeadNurturePayload, WorkrSignupInput } from '../types/LeadNurturePayload';
import { NotificationChannel } from '../utils/enums/NotificationChannel.enum';
import { buildReadinessLink, isWorkingProfessional, toE164Phone } from '../utils/helpers/leadNurture.helper';
import { dueAtForDay } from '../utils/helpers/leadNurtureSchedule.helper';

// Product company readiness check: email + WhatsApp sent after a Working Professional signs up on WorkR.
const READINESS_CHECK_STEP = 'PRODUCT_COMPANY_READINESS';
const READINESS_CHECK_SUBJECT = 'Why are you applying but still not getting interview calls?';
const READINESS_CHECK_TEMPLATE_KEYS: Record<NotificationChannel, string> = {
    [NotificationChannel.EMAIL]: 'ProblemDiagnosisWorkr',
    [NotificationChannel.WHATSAPP]: 'ProblemDiagnosisWorkr'
};

class LeadNurtureService {
    private readonly leadNurtureRepository = new LeadNurtureRepository();

    /**
     * Called after a WorkR signup has been committed. Enqueues the product company readiness check email + WhatsApp only for
     * Working Professionals. Never throws.
     */
    async handleWorkrSignup(input: WorkrSignupInput): Promise<void> {
        try {
            if (!notificationConfig.NOTIFICATIONS_ENABLED) {
                logger.info('Lead nurture skipped: NOTIFICATIONS_ENABLED is not true', { userId: input.userId });
                return;
            }

            if (!isWorkingProfessional(input.details)) {
                logger.info('Lead nurture skipped: not a working professional', { userId: input.userId, details: input.details ?? null });
                return;
            }

            const candidatePhone = toE164Phone(input.phoneNo);
            // WhatsApp needs a usable number; without one the email still goes out.
            const channels = candidatePhone
                ? [NotificationChannel.EMAIL, NotificationChannel.WHATSAPP]
                : [NotificationChannel.EMAIL];

            const payload: LeadNurturePayload = {
                userId: input.userId,
                candidateName: input.fullName.trim(),
                candidateEmail: input.email,
                candidatePhone: candidatePhone ?? '',
                readinessLink: buildReadinessLink(READINESS_CHECK_STEP),
                subject: READINESS_CHECK_SUBJECT,
                channels,
                templateKeys: READINESS_CHECK_TEMPLATE_KEYS,
                details: input.details as string,
                domain: input.domain ?? null,
                graduationYear: input.graduationYear ?? null,
                signedUpAt: (input.signedUpAt ?? new Date()).toISOString()
            };

            await enqueueLeadNurture(payload, `workr-readiness-check-${input.userId}`);
            await this.scheduleNurture(input.userId, input.signedUpAt ?? new Date());
        } catch (error) {
            logger.error('Lead nurture handling failed', {
                userId: input.userId,
                message: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Puts the user into the Day 2..Day 15 nurture: one row saying the first step is due at 11:00 IST two days after signup.
     * The scheduler (crons/leadNurture.scheduler.ts) does the rest. Never throws; a failure here must not affect the Day 0 message.
     */
    private async scheduleNurture(userId: number, signedUpAt: Date): Promise<void> {
        try {
            const firstStep = firstEnabledStepFrom(0);
            if (!firstStep) {
                return;
            }

            const dueAt = dueAtForDay(signedUpAt, firstStep.day, leadNurtureSchedulerConfig.SEND_HOUR_IST);
            const created = await this.leadNurtureRepository.createForSignup(userId, signedUpAt, firstStep.day, dueAt);
            logger.info('Lead nurture scheduled', { userId, firstStep: firstStep.day, created });
        } catch (error) {
            logger.error('Lead nurture could not be scheduled', {
                userId,
                message: error instanceof Error ? error.message : String(error)
            });
        }
    }
}

export default new LeadNurtureService();
