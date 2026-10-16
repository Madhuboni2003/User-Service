import { json2csv } from 'json-2-csv';

import { fetchWorkrDeliveriesByUser, isDeliveryLookupConfigured } from '../apis/notificationDeliveries.api';
import logger from '../configs/logger.config';
import { NURTURE_STEPS } from '../constants/leadNurtureSteps';
import LeadNurtureRepository from '../repository/leadNurture.repository';
import UserRepository from '../repository/user.repository';
import { NurtureDaySummary, NurtureLead, NurtureLeadFilters } from '../types/NurtureLeads';
import { WorkrDelivery } from '../types/WorkrDelivery';
import { BadRequestError, InternalServerError, NotFoundError, UnauthorizedError } from '../utils/errors/app.error';
import { deliveryResultsForStep, usableChannels, worstDelivery } from '../utils/helpers/leadNurtureView.helper';
import { NurtureLeadsQuery } from '../validators/nurtureLeads.validator';

const toIso = (date: Date | null) => (date ? new Date(date).toISOString() : null);

class NurtureLeadsService {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly leadNurtureRepository: LeadNurtureRepository
    ) {}

    /**
     * Admin only. The working professionals in the WorkR nurture for one day (D2..D15), with their profile details. People whose
     * sequence was stopped are left out; the list can be narrowed to active or completed sequences, by search text and, for days already sent, the delivery result the notification-service reports.
     * Returns one page as JSON, or every match as CSV when format is "csv".
     */
    async listLeads(userId: number, query: NurtureLeadsQuery) {
        await this.assertAdmin(userId);

        const step = NURTURE_STEPS.find((candidate) => candidate.enabled && candidate.day === query.day);
        if (!step) {
            throw new BadRequestError(`Day ${query.day} is not part of the nurture sequence`);
        }

        const filters: NurtureLeadFilters = {
            day: query.day,
            match: query.match,
            status: query.status,
            search: query.search,
            delivery: query.delivery
        };

        // A WhatsApp-only day (D5, D12) never went to people without a valid mobile number, so they are not part of that day.
        const everyone: NurtureLead[] = (await this.leadNurtureRepository.findLeadsForDay(filters)).flatMap((row) => {
            const channels = usableChannels(step, row.phoneNo);
            return channels.length === 0 ? [] : [{ ...row, day: query.day, channels, deliveries: [], delivery: null }];
        });

        const wantsDeliveries = query.match !== 'next';
        const mustCheckAll = query.format === 'csv' || query.delivery !== undefined;

        let leads = everyone;
        if (wantsDeliveries && mustCheckAll) {
            leads = await this.withDeliveries(everyone, query.delivery !== undefined);
            if (query.delivery) {
                leads = leads.filter((lead) => lead.delivery === query.delivery);
            }
        }

        if (query.format === 'csv') {
            return { csv: this.toCsv(leads) };
        }

        const totalCount = leads.length;
        const start = (query.page - 1) * query.limit;
        let records = leads.slice(start, start + query.limit);
        if (wantsDeliveries && !mustCheckAll) {
            records = await this.withDeliveries(records, false);
        }

        return {
            records: records.map((lead) => this.toJson(lead)),
            pagination: {
                totalCount,
                totalPages: Math.ceil(totalCount / query.limit),
                currentPage: query.page,
                limit: query.limit
            }
        };
    }

    /**
     * Admin only. For every nurture day (D2..D15): how many working professionals reached it, are currently at it, and are due for it
     * next. These are the same people, counted the same way, as listLeads(day, match) returns, so the numbers match the list.
     */
    async summary(userId: number, status?: 'active' | 'completed') {
        await this.assertAdmin(userId);

        const rows = await this.leadNurtureRepository.findRowsForSummary(status);
        const steps = NURTURE_STEPS.filter((step) => step.enabled).sort((a, b) => a.day - b.day);

        const days: NurtureDaySummary[] = steps.map((step) => {
            const summary: NurtureDaySummary = { day: step.day, channels: step.channels, reached: 0, exact: 0, next: 0 };
            for (const row of rows) {
                // Same rule as listLeads: a WhatsApp-only day is not part of the sequence for people without a valid mobile number.
                if (usableChannels(step, row.phoneNo).length === 0) {
                    continue;
                }
                if (row.lastSentStep !== null && row.lastSentStep >= step.day) {
                    summary.reached += 1;
                }
                if (row.lastSentStep === step.day) {
                    summary.exact += 1;
                }
                if (row.status === 'active' && row.nextStep === step.day) {
                    summary.next += 1;
                }
            }
            return summary;
        });

        return { totalInNurture: rows.length, days };
    }

    /**
     * Adds the delivery result of the day's message to each lead. If the notification-service cannot be asked the leads come back
     * unchanged (delivery null), unless `required` is set, because then the caller asked to filter by a result we cannot know.
     */
    private async withDeliveries(leads: NurtureLead[], required: boolean): Promise<NurtureLead[]> {
        if (leads.length === 0) {
            return leads;
        }

        let byUser: Map<number, WorkrDelivery[]>;
        try {
            if (!isDeliveryLookupConfigured()) {
                throw new Error('NOTIFICATION_SERVICE_BASE_URL or NOTIFICATION_LOOKUP_API_KEY is not configured');
            }
            byUser = await fetchWorkrDeliveriesByUser(leads.map((lead) => lead.userId));
        } catch (error) {
            logger.error('Could not load the delivery results for the nurture leads list', {
                message: error instanceof Error ? error.message : String(error)
            });
            if (required) {
                throw new InternalServerError('Delivery results are unavailable right now, so the delivery filter cannot be applied');
            }
            return leads;
        }

        return leads.map((lead) => {
            const deliveries = deliveryResultsForStep(lead.day, lead.channels, byUser.get(lead.userId) ?? []);
            return { ...lead, deliveries, delivery: worstDelivery(deliveries) };
        });
    }

    private toJson(lead: NurtureLead) {
        return {
            ...lead,
            signedUpAt: toIso(lead.signedUpAt),
            lastSentAt: toIso(lead.lastSentAt),
            nextDueAt: toIso(lead.nextDueAt)
        };
    }

    private toCsv(leads: NurtureLead[]): string {
        const rows = leads.map((lead) => ({
            userId: lead.userId,
            fullName: lead.fullName,
            email: lead.email,
            phoneNo: lead.phoneNo,
            graduationYear: lead.graduationYear,
            currentCompany: lead.currentCompany,
            currentCtc: lead.currentCtc,
            domain: lead.domain,
            yearsOfExperience: lead.yearsOfExperience,
            signedUpAt: toIso(lead.signedUpAt),
            nurtureStatus: lead.status,
            stopReason: lead.stopReason,
            day: lead.day,
            channels: lead.channels.join(' + '),
            delivery: lead.delivery,
            deliveryDetail: lead.deliveries
                .map((result) => `${result.channel}: ${result.status}${result.failedReason ? ` (${result.failedReason})` : ''}`)
                .join('; '),
            lastSentStep: lead.lastSentStep,
            lastSentAt: toIso(lead.lastSentAt),
            nextStep: lead.nextStep,
            nextDueAt: toIso(lead.nextDueAt)
        }));

        // json2csv writes a null as the text "null"; an empty cell is what a spreadsheet user expects
        const cleaned = rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value ?? ''])));

        return json2csv(cleaned, { keys: Object.keys(cleaned[0] ?? rows[0] ?? { userId: 0, fullName: '', email: '', phoneNo: '' }) });
    }

    private async assertAdmin(userId: number) {
        const userRoles = await this.userRepository.getUserRolesById(userId);

        const roleNames = userRoles.roles?.map((role) => role.name);
        if (!roleNames) {
            logger.error('No roles found');
            throw new NotFoundError('No roles found');
        }
        if (!roleNames.includes('admin')) {
            logger.error('Not an admin');
            throw new UnauthorizedError('Not an admin');
        }
    }
}

export default NurtureLeadsService;
