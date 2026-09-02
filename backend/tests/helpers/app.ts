import request from "supertest";
import type { Express } from "express";
import type { Worker } from "bullmq";
import type { User } from "@prisma/client";
import { createApp } from "../../src/app";
import { allQueues } from "../../src/lib/queues";
import { setSendEmailOverride } from "../../src/lib/mailer";
import { prisma } from "../../src/lib/prisma";
import { redis } from "../../src/lib/redis";
import { pingElasticsearch, ensureEmailIndex } from "../../src/lib/es";
import { stopWorkers } from "../../src/workers/start";
import { deletePhase2Users } from "./db";

export async function assertInfra(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
  if ((await redis.ping()) !== "PONG") {
    throw new Error("Redis is not reachable");
  }
  if (!(await pingElasticsearch())) {
    throw new Error("Elasticsearch is not reachable");
  }
  await ensureEmailIndex();
}

export async function preparePhase2(): Promise<void> {
  await assertInfra();
  await deletePhase2Users();
  await flushOperationalKeys();
}

export function buildApp(): Express {
  return createApp();
}

export async function loginAgent(app: Express, user: User) {
  const agent = request.agent(app);
  const res = await agent.post("/__test__/session").send({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    },
  });
  if (res.status !== 200) {
    throw new Error(`test session failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return agent;
}

export async function flushOperationalKeys(): Promise<void> {
  const patterns = [
    "rl:*",
    "lastsend:*",
    "permit:*",
    "gap:*",
    "slack:rl:*",
    "smtp-receipt:*",
    "lock:alloc:*",
    "oauth:slack:*",
  ];
  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  }
}

export async function stopAndDrain(workers: Worker[]): Promise<void> {
  if (workers.length) {
    await stopWorkers(workers);
  }
  setSendEmailOverride(null);
  for (const queue of allQueues()) {
    await queue.obliterate({ force: true }).catch(() => undefined);
    await queue.drain(true).catch(() => undefined);
  }
  await flushOperationalKeys();
}
