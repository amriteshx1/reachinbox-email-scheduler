import { Queue } from "bullmq";
import {
  EMAIL_JOB_OPTIONS,
  EMAIL_SEND_JOB,
  INDEX_JOB_OPTIONS,
  QUEUE_EMAIL_SEND,
  QUEUE_SEARCH_INDEX,
  QUEUE_SLACK_NOTIFY,
  SEARCH_INDEX_JOB,
  SLACK_JOB_OPTIONS,
  SLACK_RATE_LIMIT_JOB,
  indexJobId,
  sendJobId,
  slackJobId,
} from "../config/constants";
import { env } from "../config/env";
import { bullmqConnection } from "./redis";
import type { EmailSendJobData, SearchIndexJobData, SlackNotifyJobData } from "../types/jobs";

export const emailSendQueue = new Queue<EmailSendJobData>(QUEUE_EMAIL_SEND, {
  connection: bullmqConnection,
  prefix: env.BULLMQ_PREFIX,
  defaultJobOptions: EMAIL_JOB_OPTIONS,
});

export const searchIndexQueue = new Queue<SearchIndexJobData>(QUEUE_SEARCH_INDEX, {
  connection: bullmqConnection,
  prefix: env.BULLMQ_PREFIX,
  defaultJobOptions: INDEX_JOB_OPTIONS,
});

export const slackNotifyQueue = new Queue<SlackNotifyJobData>(QUEUE_SLACK_NOTIFY, {
  connection: bullmqConnection,
  prefix: env.BULLMQ_PREFIX,
  defaultJobOptions: SLACK_JOB_OPTIONS,
});

export function allQueues() {
  return [emailSendQueue, searchIndexQueue, slackNotifyQueue];
}

export async function enqueueEmailSend(data: EmailSendJobData, scheduledAt: Date): Promise<void> {
  const delay = Math.max(0, scheduledAt.getTime() - Date.now());
  await emailSendQueue.add(EMAIL_SEND_JOB, data, {
    jobId: sendJobId(data.emailId),
    delay,
  });
}

export async function enqueueEmailSendBulk(
  items: Array<{ data: EmailSendJobData; scheduledAt: Date }>,
): Promise<void> {
  const chunkSize = 250;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await emailSendQueue.addBulk(
      chunk.map(({ data, scheduledAt }) => ({
        name: EMAIL_SEND_JOB,
        data,
        opts: {
          jobId: sendJobId(data.emailId),
          delay: Math.max(0, scheduledAt.getTime() - Date.now()),
          ...EMAIL_JOB_OPTIONS,
        },
      })),
    );
  }
}

export async function enqueueSearchIndex(emailId: string, op: SearchIndexJobData["op"] = "upsert"): Promise<void> {
  await searchIndexQueue.add(
    SEARCH_INDEX_JOB,
    { emailId, op },
    { jobId: `${indexJobId(emailId)}-${op}-${Date.now()}` },
  );
}

export async function enqueueSlackRateLimit(data: SlackNotifyJobData): Promise<void> {
  try {
    await slackNotifyQueue.add(SLACK_RATE_LIMIT_JOB, data, {
      jobId: slackJobId(data.userId, data.senderId, data.hourBucket),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/already exists/i.test(message)) return;
    throw err;
  }
}

export async function closeQueues(): Promise<void> {
  await Promise.all(allQueues().map((q) => q.close()));
}
