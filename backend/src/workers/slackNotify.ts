import { Worker } from "bullmq";
import { env } from "../config/env";
import { QUEUE_SLACK_NOTIFY } from "../config/constants";
import { createBullmqConnection } from "../lib/redis";
import { logger } from "../lib/logger";
import { notifyRateLimit } from "../services/slack";
import type { SlackNotifyJobData } from "../types/jobs";

export function createSlackNotifyWorker(): Worker<SlackNotifyJobData> {
  const worker = new Worker<SlackNotifyJobData>(
    QUEUE_SLACK_NOTIFY,
    async (job) => {
      const result = await notifyRateLimit(job.data);
      logger.info({ result, userId: job.data.userId, senderId: job.data.senderId }, "slack notify result");
    },
    {
      connection: createBullmqConnection(),
      prefix: env.BULLMQ_PREFIX,
      concurrency: 2,
    },
  );

  worker.on("failed", (job, err) => {
    logger.warn({ jobId: job?.id, err }, "slack-notify failed");
  });
  worker.on("error", (err) => {
    logger.error({ err }, "slack-notify worker error");
  });

  return worker;
}
