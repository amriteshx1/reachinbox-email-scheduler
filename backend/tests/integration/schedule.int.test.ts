import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Worker } from "bullmq";
import { EmailStatus } from "@prisma/client";
import { createCampaign } from "../../src/services/scheduler";
import { prisma } from "../../src/lib/prisma";
import { emailSendQueue } from "../../src/lib/queues";
import { sendJobId } from "../../src/config/constants";
import { hourBucketUtc } from "../../src/lib/hours";
import { env } from "../../src/config/env";
import { preparePhase2, buildApp, loginAgent, stopAndDrain } from "../helpers/app";
import { createUserWithSender, deletePhase2Users } from "../helpers/db";

describe("campaign scheduling (1000+ and duplicates)", () => {
  let workers: Worker[] = [];

  beforeAll(async () => {
    await preparePhase2();
  });

  afterEach(async () => {
    await stopAndDrain(workers);
    workers = [];
    await deletePhase2Users();
  });

  it("schedules 1000 emails at the same start time without dropping jobs", async () => {
    const { user, sender } = await createUserWithSender();
    const startAt = new Date("2030-01-01T14:00:00.000Z");
    const leads = Array.from({ length: 1000 }, (_, i) => `lead${i}@example.com`);

    const result = await createCampaign({
      userId: user.id,
      senderId: sender.id,
      subject: "Burst",
      body: "hello",
      startAt,
      delayMs: env.MIN_INTER_EMAIL_MS,
      hourlyLimit: 200,
      leads,
    });

    expect(result.scheduledCount).toBe(1000);
    const emails = await prisma.email.findMany({
      where: { campaignId: result.campaignId },
      orderBy: { scheduledAt: "asc" },
    });
    expect(emails).toHaveLength(1000);
    expect(emails.every((e) => e.status === EmailStatus.scheduled)).toBe(true);

    for (let i = 1; i < emails.length; i++) {
      expect(emails[i]!.scheduledAt.getTime()).toBeGreaterThan(emails[i - 1]!.scheduledAt.getTime());
      expect(emails[i]!.scheduledAt.getTime() - emails[i - 1]!.scheduledAt.getTime()).toBeGreaterThanOrEqual(
        env.MIN_INTER_EMAIL_MS,
      );
    }

    const perHour = new Map<string, number>();
    for (const email of emails) {
      const key = hourBucketUtc(email.scheduledAt.getTime());
      perHour.set(key, (perHour.get(key) ?? 0) + 1);
    }
    for (const count of perHour.values()) {
      expect(count).toBeLessThanOrEqual(200);
    }

    const jobs = await Promise.all(emails.map((email) => emailSendQueue.getJob(sendJobId(email.id))));
    expect(jobs.filter(Boolean)).toHaveLength(1000);
    const firstState = await jobs[0]!.getState();
    expect(firstState).toBe("delayed");
  }, 90_000);

  it("deduplicates CSV leads in a campaign", async () => {
    const { user, sender } = await createUserWithSender();
    const app = buildApp();
    const agent = await loginAgent(app, user);
    const csv = ["email", "a@example.com", "a@example.com", "b@example.com", "not-an-email"].join("\n");

    const res = await agent
      .post("/api/campaigns")
      .field("subject", "Dupes")
      .field("body", "hi")
      .field("startAt", new Date(Date.now() + 60_000).toISOString())
      .field("delayMs", String(env.MIN_INTER_EMAIL_MS))
      .field("hourlyLimit", "50")
      .field("senderId", sender.id)
      .attach("file", Buffer.from(csv), "leads.csv");

    expect(res.status).toBe(201);
    expect(res.body.scheduledCount).toBe(2);
    expect(res.body.skippedDuplicate).toBe(1);
    expect(res.body.skippedInvalid).toBe(1);
  });

  it("rejects a second enqueue of the same job id", async () => {
    const { user, sender } = await createUserWithSender();
    const created = await createCampaign({
      userId: user.id,
      senderId: sender.id,
      subject: "Once",
      body: "hi",
      startAt: new Date(Date.now() + 120_000),
      delayMs: env.MIN_INTER_EMAIL_MS,
      hourlyLimit: 50,
      leads: ["once@example.com"],
    });
    const emailId = created.emails[0]!.id;
    const jobId = sendJobId(emailId);
    const before = await emailSendQueue.getJob(jobId);
    expect(before).toBeTruthy();
    const again = await emailSendQueue.add(
      "send",
      {
        emailId,
        userId: user.id,
        senderId: sender.id,
        campaignId: created.campaignId,
        delayMs: env.MIN_INTER_EMAIL_MS,
        hourlyLimit: 50,
      },
      { jobId },
    );
    expect(again.id).toBe(jobId);
    expect(await before!.getState()).toBe("delayed");
    expect(await again.getState()).toBe("delayed");
    const delayed = await emailSendQueue.getJobs(["delayed", "waiting", "prioritized", "active"]);
    expect(delayed.filter((job) => job.id === jobId)).toHaveLength(1);
  });

  it("isolates emails between users", async () => {
    const a = await createUserWithSender();
    const b = await createUserWithSender();
    await createCampaign({
      userId: a.user.id,
      senderId: a.sender.id,
      subject: "Only A",
      body: "secret",
      startAt: new Date(Date.now() + 60_000),
      delayMs: env.MIN_INTER_EMAIL_MS,
      hourlyLimit: 20,
      leads: ["only-a@example.com"],
    });

    const app = buildApp();
    const agentB = await loginAgent(app, b.user);
    const list = await agentB.get("/api/emails?status=scheduled");
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(0);
  });
});
