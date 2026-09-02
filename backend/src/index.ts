import { env } from "./config/env";
import { logger } from "./lib/logger";
import { createApp } from "./app";
import { installShutdown } from "./lib/shutdown";
import { ensureEmailIndex } from "./lib/es";
import { startWorkers } from "./workers/start";
import type { Worker } from "bullmq";

async function main() {
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "api listening");
  });

  try {
    await ensureEmailIndex();
  } catch (err) {
    logger.warn({ err }, "elasticsearch unavailable at api start");
  }

  let workers: Worker[] = [];
  if (env.WORKER_ENABLED) {
    workers = await startWorkers();
  }

  installShutdown({ server, workers });
}

main().catch((err) => {
  logger.error({ err }, "api failed to start");
  process.exit(1);
});
