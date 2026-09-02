import { logger } from "./lib/logger";
import { installShutdown } from "./lib/shutdown";
import { startWorkers } from "./workers/start";

async function main() {
  const workers = await startWorkers();
  logger.info("worker process ready");
  installShutdown({ workers });
}

main().catch((err) => {
  logger.error({ err }, "worker failed to start");
  process.exit(1);
});
