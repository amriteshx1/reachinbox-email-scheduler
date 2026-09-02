import { Client } from "@elastic/elasticsearch";
import { EMAIL_INDEX } from "../config/constants";
import { env } from "../config/env";
import { logger } from "./logger";

export const es = new Client({
  node: env.ELASTICSEARCH_URL,
  requestTimeout: 2_000,
  pingTimeout: 2_000,
  maxRetries: 1,
});

let indexReady = false;

export async function pingElasticsearch(): Promise<boolean> {
  try {
    return await withTimeout(es.ping(), 2_000);
  } catch {
    return false;
  }
}

export async function ensureEmailIndex(): Promise<void> {
  if (indexReady) return;
  try {
    const exists = await withTimeout(es.indices.exists({ index: EMAIL_INDEX }), 2_500);
    if (!exists) {
      await withTimeout(
        es.indices.create({
          index: EMAIL_INDEX,
          mappings: {
            properties: {
              userId: { type: "keyword" },
              campaignId: { type: "keyword" },
              senderId: { type: "keyword" },
              toEmail: {
                type: "keyword",
                fields: { text: { type: "text" } },
              },
              subject: { type: "text" },
              body: { type: "text" },
              status: { type: "keyword" },
              scheduledAt: { type: "date" },
              sentAt: { type: "date" },
              previewUrl: { type: "keyword", index: false },
              failureReason: { type: "text" },
            },
          },
        }),
        5_000,
      );
      logger.info({ index: EMAIL_INDEX }, "created elasticsearch index");
    }
    indexReady = true;
  } catch (err) {
    logger.warn({ err }, "elasticsearch index ensure failed");
    throw err;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`elasticsearch timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
