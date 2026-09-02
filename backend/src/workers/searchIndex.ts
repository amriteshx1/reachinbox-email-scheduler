import { Worker } from "bullmq";
import { env } from "../config/env";
import { QUEUE_SEARCH_INDEX } from "../config/constants";
import { createBullmqConnection } from "../lib/redis";
import { logger } from "../lib/logger";
import { deleteEmailDocument, upsertEmailDocument } from "../services/search";
import type { SearchIndexJobData } from "../types/jobs";

export function createSearchIndexWorker(): Worker<SearchIndexJobData> {
  const worker = new Worker<SearchIndexJobData>(
    QUEUE_SEARCH_INDEX,
    async (job) => {
      if (job.data.op === "delete") {
        await deleteEmailDocument(job.data.emailId);
        return;
      }
      await upsertEmailDocument(job.data.emailId);
    },
    {
      connection: createBullmqConnection(),
      prefix: env.BULLMQ_PREFIX,
      concurrency: 5,
    },
  );

  worker.on("failed", (job, err) => {
    logger.warn({ jobId: job?.id, err }, "search-index failed");
  });
  worker.on("error", (err) => {
    logger.error({ err }, "search-index worker error");
  });

  return worker;
}
