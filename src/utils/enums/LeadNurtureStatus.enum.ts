export enum LeadNurtureStatus {
    ACTIVE = 'active',
    COMPLETED = 'completed',
    STOPPED = 'stopped'
}

// Why a sequence stopped before its last step.
export enum LeadNurtureStopReason {
    // The person registered on the VSL: the WorkR sequence ends and the VSL's own sequence takes over.
    VSL_REGISTERED = 'vsl_registered',
    USER_DELETED = 'user_deleted'
}
