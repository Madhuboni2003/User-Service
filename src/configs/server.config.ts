import dotenv from 'dotenv';

type ServerConfig = {
    PORT: number
    SALT :number
    JWT_SECRET : string
    JWT_EXPRIRES_IN : string
}

type AwsConfig = {
    AWS_REGION: string
    AWS_SECRET_ACCESS_KEY: string
    AWS_ACCESS_KEY_ID: string
    AWS_S3_BUCKET_NAME: string
}

type DBConfig = {
    DB_HOST: string
    DB_USER: string
    DB_PASSWORD: string
    DB_NAME: string
}

type FrontendConfig= {
    FRONTEND_URL: string
}

dotenv.config();

export const serverConfig: ServerConfig =  {
    PORT: Number(process.env.PORT) || 3000,
    SALT : Number(process.env.SALT),
    JWT_SECRET : String(process.env.JWT_SECRET),
    JWT_EXPRIRES_IN : String(process.env.JWT_EXPRIRES_IN)
};

export const dbConfig: DBConfig = {
    DB_HOST: process.env.DB_HOST || 'localhost',
    DB_USER: process.env.DB_USER || 'root',
    DB_PASSWORD: process.env.DB_PASSWORD || 'root',
    DB_NAME: process.env.DB_NAME || 'test_db'
};

export const awsConfig: AwsConfig = {
    AWS_REGION: String(process.env.AWS_REGION),
    AWS_ACCESS_KEY_ID: String(process.env.AWS_ACCESS_KEY_ID),
    AWS_SECRET_ACCESS_KEY: String(process.env.AWS_SECRET_ACCESS_KEY),
    AWS_S3_BUCKET_NAME: String(process.env.AWS_S3_BUCKET_NAME)
};

export const frontendConfig: FrontendConfig = {
    FRONTEND_URL: String(process.env.FRONTEND_URL)
};

type RedisConfig = {
    REDIS_HOST: string
    REDIS_PORT: number
    REDIS_PASSWORD: string | undefined
    REDIS_DB: number
    REDIS_TLS: boolean
}

type NotificationConfig = {
    NOTIFICATIONS_ENABLED: boolean
    LEAD_NURTURE_QUEUE_NAME: string
    LEAD_NURTURE_JOB_NAME: string
    READINESS_LINK_BASE_URL: string
    ENQUEUE_TIMEOUT_MS: number
}

type LeadNurtureSchedulerConfig = {
    ENABLED: boolean
    DRY_RUN: boolean
    TICK_MINUTES: number
    BATCH_SIZE: number
    LOCK_MS: number
    WINDOW_START_HOUR_IST: number
    WINDOW_END_HOUR_IST: number
    SEND_HOUR_IST: number
}

type VslEngagementConfig = {
    BASE_URL: string
    API_KEY: string
    API_KEY_HEADER: string
    TIMEOUT_MS: number
}

export const redisConfig: RedisConfig = {
    REDIS_HOST: process.env.REDIS_HOST || 'localhost',
    REDIS_PORT: Number(process.env.REDIS_PORT) || 6379,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
    REDIS_DB: Number(process.env.REDIS_DB) || 0,
    REDIS_TLS: process.env.REDIS_TLS === 'true'
};

export const notificationConfig: NotificationConfig = {
    // Master switch: when false nothing is ever enqueued (local dev, tests, rollback).
    NOTIFICATIONS_ENABLED: process.env.NOTIFICATIONS_ENABLED === 'true',
    LEAD_NURTURE_QUEUE_NAME: process.env.LEAD_NURTURE_QUEUE_NAME || 'workr-signup-notification-queue',
    LEAD_NURTURE_JOB_NAME: process.env.LEAD_NURTURE_JOB_NAME || 'payload:workr-signup-notification',
    READINESS_LINK_BASE_URL: process.env.READINESS_LINK_BASE_URL || 'https://ai-proof-engineering-readiness-chec.vercel.app/',
    // How long the background enqueue may wait for Redis before it is logged as failed (signup never waits for it).
    ENQUEUE_TIMEOUT_MS: Number(process.env.ENQUEUE_TIMEOUT_MS) || 5000
};


// The Day 2..Day 15 nurture runner. Off unless explicitly enabled, and when enabled it only logs what it would send until
// LEAD_NURTURE_DRY_RUN is set to exactly "false".
export const leadNurtureSchedulerConfig: LeadNurtureSchedulerConfig = {
    ENABLED: process.env.LEAD_NURTURE_SCHEDULER_ENABLED === 'true',
    DRY_RUN: process.env.LEAD_NURTURE_DRY_RUN !== 'false',
    // How often a tick runs, on the clock (15 = :00, :15, :30, :45). Must divide 60.
    TICK_MINUTES: Number(process.env.LEAD_NURTURE_TICK_MINUTES) || 15,
    // Kept at or below the VSL lookup limit (200 contacts per call).
    BATCH_SIZE: Math.min(Number(process.env.LEAD_NURTURE_BATCH_SIZE) || 100, 200),
    // A claimed row that is never released (crash) becomes claimable again after this long.
    LOCK_MS: Number(process.env.LEAD_NURTURE_LOCK_MS) || 10 * 60 * 1000,
    // Messages go out between these hours IST, and each day's message is due at SEND_HOUR_IST.
    WINDOW_START_HOUR_IST: Number(process.env.LEAD_NURTURE_WINDOW_START_HOUR_IST) || 10,
    WINDOW_END_HOUR_IST: Number(process.env.LEAD_NURTURE_WINDOW_END_HOUR_IST) || 19,
    SEND_HOUR_IST: Number(process.env.LEAD_NURTURE_SEND_HOUR_IST) || 11
};

// The VSL's candidate-form-details-service: asked which WorkR users have already registered there (POST /integrations/workr/engagement).
export const vslEngagementConfig: VslEngagementConfig = {
    // e.g. https://<form api domain>/api/v1 . Empty means "cannot ask", so nothing is ever sent.
    BASE_URL: (process.env.VSL_API_BASE_URL || '').replace(/\/+$/, ''),
    API_KEY: process.env.VSL_WORKR_API_KEY || '',
    API_KEY_HEADER: process.env.VSL_WORKR_API_KEY_HEADER || 'x-workr-api-key',
    TIMEOUT_MS: Number(process.env.VSL_API_TIMEOUT_MS) || 8000
};
