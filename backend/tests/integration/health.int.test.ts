import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createEmailSendWorker } from "../../src/workers/emailSend";
import { env } from "../../src/config/env";
import { INDEX_JOB_OPTIONS, EMAIL_JOB_OPTIONS } from "../../src/config/constants";
import { redis } from "../../src/lib/redis";
import { hourBucketUtc } from "../../src/lib/hours";
import { tryAcquireSendPermit, releaseSendPermit, reserveNextSlot } from "../../src/services/rateLimiter";
import { preparePhase2, buildApp, loginAgent, stopAndDrain, flushOperationalKeys } from "../helpers/app";
import { createUserWithSender, deletePhase2Users } from "../helpers/db";

describe("health, config, and redis lua", () => {
  beforeAll(async () => {
    await preparePhase2();
  });

  afterEach(async () => {
    await flushOperationalKeys();
  });

  afterAll(async () => {
    await deletePhase2Users();
    await flushOperationalKeys();
  });

  it("reports postgres, redis, and elasticsearch ready", async () => {
    const app = buildApp();
    const health = await request(app).get("/health");
    expect(health.status).toBe(200);
    expect(health.body.status).toBe("ok");

    const ready = await request(app).get("/ready");
    expect(ready.status).toBe(200);
    expect(ready.body.checks.postgres).toBe(true);
    expect(ready.body.checks.redis).toBe(true);
    expect(ready.body.checks.elasticsearch).toBe(true);
  });

  it("keeps rate limits, delay, and worker settings environment-driven", () => {
    expect(env.MIN_INTER_EMAIL_MS).toBeGreaterThan(0);
    expect(env.MAX_EMAILS_PER_HOUR).toBeGreaterThan(0);
    expect(env.MAX_EMAILS_PER_HOUR_PER_SENDER).toBeGreaterThan(0);
    expect(env.WORKER_CONCURRENCY).toBeGreaterThan(0);
    expect(env.WORKER_LOCK_DURATION_MS).toBeGreaterThan(0);
    expect(EMAIL_JOB_OPTIONS.attempts).toBeGreaterThanOrEqual(3);
    expect(INDEX_JOB_OPTIONS.attempts).toBeGreaterThanOrEqual(5);
  });

  it("enforces min-delay atomically across concurrent permit attempts", async () => {
    const senderId = `snd-delay-${Date.now()}`;
    const now = Date.now();
    const ids = Array.from({ length: 8 }, (_, i) => `e-delay-${i}-${now}`);
    const results = await Promise.all(
      ids.map((emailId) =>
        tryAcquireSendPermit({
          emailId,
          senderId,
          nowMs: now,
          minDelayMs: 500,
          senderLimit: 100,
          globalLimit: 1000,
        }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === "min-delay")).toHaveLength(7);
    await Promise.all(ids.map((id) => releaseSendPermit(id)));
  });

  it("does not let concurrent workers exceed the hourly sender cap", async () => {
    const senderId = `cap-${Date.now()}`;
    const now = Date.now();
    const limit = 5;
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        tryAcquireSendPermit({
          emailId: `e-cap-${i}-${now}`,
          senderId,
          nowMs: now,
          minDelayMs: 0,
          senderLimit: limit,
          globalLimit: 1000,
        }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(limit);
    expect(results.filter((r) => !r.ok && r.reason === "hourly")).toHaveLength(20 - limit);
    const stored = Number(await redis.get(`rl:s:${senderId}:${hourBucketUtc(now)}`));
    expect(stored).toBe(limit);
  });

  it("does not let concurrent senders exceed the global hourly cap", async () => {
    const now = Date.now();
    const globalLimit = 4;
    const results = await Promise.all(
      Array.from({ length: 16 }, (_, i) =>
        tryAcquireSendPermit({
          emailId: `e-g-${i}-${now}`,
          senderId: `g-sender-${i % 4}-${now}`,
          nowMs: now,
          minDelayMs: 0,
          senderLimit: 100,
          globalLimit,
        }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(globalLimit);
    expect(Number(await redis.get(`rl:g:${hourBucketUtc(now)}`))).toBe(globalLimit);
  });

  it("treats a second acquire of the same email id as idempotent", async () => {
    const senderId = `idem-${Date.now()}`;
    const now = Date.now();
    const emailId = `same-${now}`;
    const first = await tryAcquireSendPermit({
      emailId,
      senderId,
      nowMs: now,
      minDelayMs: 0,
      senderLimit: 10,
      globalLimit: 100,
    });
    const second = await tryAcquireSendPermit({
      emailId,
      senderId,
      nowMs: now,
      minDelayMs: 0,
      senderLimit: 10,
      globalLimit: 100,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(Number(await redis.get(`rl:s:${senderId}:${hourBucketUtc(now)}`))).toBe(1);
  });

  it("releases capacity after a failed SMTP so the slot can be reused", async () => {
    const senderId = `rel-${Date.now()}`;
    const now = Date.now();
    const firstId = `rel-a-${now}`;
    const acquired = await tryAcquireSendPermit({
      emailId: firstId,
      senderId,
      nowMs: now,
      minDelayMs: 0,
      senderLimit: 1,
      globalLimit: 10,
    });
    expect(acquired.ok).toBe(true);
    await releaseSendPermit(firstId);
    const reused = await tryAcquireSendPermit({
      emailId: `rel-b-${now}`,
      senderId,
      nowMs: now,
      minDelayMs: 0,
      senderLimit: 1,
      globalLimit: 10,
    });
    expect(reused.ok).toBe(true);
  });

  it("reserves future hourly slots instead of failing", async () => {
    const senderId = `slot-${Date.now()}`;
    const now = Date.now();
    const first = await reserveNextSlot({
      senderId,
      nowMs: now,
      delayMs: 100,
      senderLimit: 3,
      globalLimit: 1000,
    });
    const second = await reserveNextSlot({
      senderId,
      nowMs: now,
      delayMs: 100,
      senderLimit: 3,
      globalLimit: 1000,
    });
    expect(first.scheduledAtMs).toBeGreaterThan(now);
    expect(second.scheduledAtMs).toBeGreaterThan(first.scheduledAtMs);
    expect(second.hourBucket).toBe(first.hourBucket);
  });

  it("closes workers without throwing (graceful worker shutdown)", async () => {
    const worker = createEmailSendWorker();
    await stopAndDrain([worker]);
    expect(worker.closing).toBeTruthy();
  });

  it("closes the HTTP server without throwing (graceful API shutdown)", async () => {
    const app = buildApp();
    const server = app.listen(0);
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("does not persist smtp passwords on public sender payloads", async () => {
    const { user } = await createUserWithSender();
    const app = buildApp();
    const agent = await loginAgent(app, user);
    const res = await agent.get("/api/senders");
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("not-a-real-password");
    expect(res.body.senders[0].smtpPass).toBeUndefined();
  });
});
