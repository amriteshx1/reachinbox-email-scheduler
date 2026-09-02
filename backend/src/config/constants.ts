import { isProd } from "./env";

export const QUEUE_EMAIL_SEND = "email-send";
export const QUEUE_SEARCH_INDEX = "search-index";
export const QUEUE_SLACK_NOTIFY = "slack-notify";

export const EMAIL_SEND_JOB = "send";
export const SEARCH_INDEX_JOB = "upsert";
export const SLACK_RATE_LIMIT_JOB = "rate-limit";

export function sendJobId(emailId: string): string {
  return `send-${emailId}`;
}

export function indexJobId(emailId: string): string {
  return `index-${emailId}`;
}

export function slackJobId(userId: string, senderId: string, hourBucket: string): string {
  return `slack-${userId}-${senderId}-${hourBucket}`;
}

export const EMAIL_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 2_000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 1_000 },
};

export const INDEX_JOB_OPTIONS = {
  attempts: 10,
  backoff: { type: "exponential" as const, delay: 1_000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};

export const SLACK_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2_000 },
  removeOnComplete: { count: 50 },
  removeOnFail: { count: 200 },
};

export const MS_PER_HOUR = 3_600_000;
export const SCHEDULE_HORIZON_HOURS = 48;
export const EMAIL_INDEX = "emails";
export const SESSION_COOKIE = "sid";
export const SENDER_COUNT = 3;

/** Cross-site SPA (Vercel) → API (Render) needs SameSite=None; Secure. Localhost stays Lax. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true as const,
  sameSite: (isProd ? "none" : "lax") as "none" | "lax",
  secure: isProd,
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
