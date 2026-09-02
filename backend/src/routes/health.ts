import { Router } from "express";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { pingElasticsearch } from "../lib/es";
import { asyncHandler } from "../middleware/errorHandler";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

healthRouter.get(
  "/ready",
  asyncHandler(async (_req, res) => {
    const checks = {
      postgres: false,
      redis: false,
      elasticsearch: false,
    };

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.postgres = true;
    } catch {
      checks.postgres = false;
    }

    try {
      checks.redis = (await redis.ping()) === "PONG";
    } catch {
      checks.redis = false;
    }

    checks.elasticsearch = await pingElasticsearch();

    const ready = checks.postgres && checks.redis;
    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "degraded",
      checks,
    });
  }),
);
