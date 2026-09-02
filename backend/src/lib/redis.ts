import Redis from "ioredis";
import { env } from "../config/env";
import { logger } from "./logger";

function attachErrorHandler(client: Redis): Redis {
  client.on("error", (err) => {
    logger.warn({ err }, "redis connection error");
  });
  return client;
}

export function createBullmqConnection(): Redis {
  return attachErrorHandler(
    new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    }),
  );
}

export const redis = attachErrorHandler(
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 20,
    enableReadyCheck: true,
  }),
);

export const bullmqConnection = createBullmqConnection();
