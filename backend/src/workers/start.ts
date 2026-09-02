import type { Worker } from "bullmq";
import { logger } from "../lib/logger";
import { ensureEmailIndex } from "../lib/es";
import { reconcileScheduledEmails } from "../services/reconcile";
import { createEmailSendWorker } from "./emailSend";
import { createSearchIndexWorker } from "./searchIndex";
import { createSlackNotifyWorker } from "./slackNotify";

export async function startWorkers(): Promise<Worker[]> {
  try {
    await ensureEmailIndex();
  } catch (err) {
    logger.warn({ err }, "elasticsearch unavailable at worker start; index jobs will retry");
  }

  const workers = [createEmailSendWorker(), createSearchIndexWorker(), createSlackNotifyWorker()];
  await reconcileScheduledEmails();
  logger.info({ count: workers.length }, "bullmq workers started");
  return workers;
}

export async function stopWorkers(workers: Worker[]): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
}
