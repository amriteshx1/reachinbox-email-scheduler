import type { Server } from "node:http";
import type { Worker } from "bullmq";
import { logger } from "./logger";
import { prisma } from "./prisma";
import { bullmqConnection, redis } from "./redis";
import { closeQueues } from "./queues";
import { closeTransporters } from "./mailer";
import { stopWorkers } from "../workers/start";

let shuttingDown = false;

export function installShutdown(input: { server?: Server; workers?: Worker[] }): void {
  const onSignal = (signal: string) => {
    void shutdown(signal, input);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
}

async function shutdown(signal: string, input: { server?: Server; workers?: Worker[] }): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down");

  const force = setTimeout(() => {
    logger.error("forced shutdown after timeout");
    process.exit(1);
  }, 20_000);
  force.unref();

  try {
    if (input.server) {
      await new Promise<void>((resolve) => input.server!.close(() => resolve()));
    }
    if (input.workers?.length) {
      await stopWorkers(input.workers);
    }
    await closeQueues();
    await closeTransporters();
    await prisma.$disconnect();
    redis.disconnect();
    bullmqConnection.disconnect();
    logger.info("shutdown complete");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "shutdown failed");
    process.exit(1);
  }
}
