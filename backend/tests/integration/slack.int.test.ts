import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Worker } from "bullmq";
import { EmailStatus } from "@prisma/client";
import request from "supertest";
import { prisma } from "../../src/lib/prisma";
import { slackNotifyQueue, enqueueSlackRateLimit } from "../../src/lib/queues";
import { createEmailSendWorker } from "../../src/workers/emailSend";
import { createSlackNotifyWorker } from "../../src/workers/slackNotify";
import { notifyRateLimit, slackConfigured, slackStatus } from "../../src/services/slack";
import { hourBucketUtc } from "../../src/lib/hours";
import { preparePhase2, buildApp, loginAgent, stopAndDrain } from "../helpers/app";
import { createUserWithSender, deletePhase2Users, seedImmediateEmails } from "../helpers/db";
import { installMockSmtp } from "../helpers/mail";
import { startHttpCatcher } from "../helpers/httpCatcher";
import { waitFor, sleep } from "../helpers/wait";

async function connectSlack(userId: string, webhookUrl: string) {
  await prisma.slackConnection.upsert({
    where: { userId },
    create: {
      userId,
      teamId: "T-test",
      teamName: "Test Team",
      accessToken: "xoxb-test",
      webhookUrl,
      webhookChannel: "#alerts",
    },
    update: { webhookUrl, teamName: "Test Team" },
  });
}

describe("slack oauth path and rate-limit notifications", () => {
  let workers: Worker[] = [];
  let restoreMail: () => void = () => undefined;
  let catcher: Awaited<ReturnType<typeof startHttpCatcher>> | null = null;

  beforeAll(async () => {
    await preparePhase2();
  });

  afterEach(async () => {
    await stopAndDrain(workers);
    workers = [];
    restoreMail();
    await catcher?.close().catch(() => undefined);
    catcher = null;
    await deletePhase2Users();
  });

  it("exposes a real Slack OAuth authorize URL when configured", async () => {
    const { user } = await createUserWithSender();
    const app = buildApp();
    const agent = await loginAgent(app, user);
    const res = await agent.get("/auth/slack").redirects(0);
    if (slackConfigured()) {
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("slack.com/oauth");
      expect(res.headers.location).toContain("client_id=");
      expect(res.headers.location).toContain("incoming-webhook");
    } else {
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe("SLACK_NOT_CONFIGURED");
    }
  });

  it("reports disconnected Slack as a safe no-op and does not notify", async () => {
    const { user, sender } = await createUserWithSender();
    const result = await notifyRateLimit({
      userId: user.id,
      senderId: sender.id,
      senderLabel: sender.label,
      hourBucket: hourBucketUtc(Date.now()),
      senderLimit: 3,
      globalLimit: 100,
    });
    expect(result).toBe("skipped");
    const status = await slackStatus(user.id);
    expect(status.connected).toBe(false);
  });

  it("sends exactly one Slack notification per sender/hour despite many overflow jobs", async () => {
    catcher = await startHttpCatcher();
    const mock = installMockSmtp();
    restoreMail = mock.restore;
    const { user, sender } = await createUserWithSender();
    await connectSlack(user.id, catcher.url);

    workers = [createEmailSendWorker(), createSlackNotifyWorker()];
    const { campaignId } = await seedImmediateEmails({
      user,
      sender,
      count: 8,
      hourlyLimit: 3,
    });

    await waitFor(async () => {
      const sent = await prisma.email.count({ where: { campaignId, status: EmailStatus.sent } });
      return sent >= 3 ? sent : false;
    }, { timeoutMs: 12_000, label: "overflow sends" });

    await waitFor(async () => (catcher!.bodies.length >= 1 ? catcher!.bodies.length : false), {
      timeoutMs: 8_000,
      label: "slack webhook",
    });
    await sleep(500);
    expect(catcher.bodies).toHaveLength(1);
    expect(catcher.bodies[0]).toContain("Hourly email limit reached");
    expect(catcher.bodies[0]).toContain(sender.label);

    const jobs = await slackNotifyQueue.getJobs(["waiting", "delayed", "active", "completed"]);
    const matching = jobs.filter((job) => job.data.senderId === sender.id);
    expect(matching.length).toBeLessThanOrEqual(1);
  });

  it("starts notifying after Slack is connected without restarting workers", async () => {
    catcher = await startHttpCatcher();
    const { user, sender } = await createUserWithSender();
    workers = [createSlackNotifyWorker()];

    const skipped = await notifyRateLimit({
      userId: user.id,
      senderId: sender.id,
      senderLabel: sender.label,
      hourBucket: `pre-${Date.now()}`,
      senderLimit: 3,
      globalLimit: 100,
    });
    expect(skipped).toBe("skipped");
    expect(catcher.bodies).toHaveLength(0);

    await connectSlack(user.id, catcher.url);
    await enqueueSlackRateLimit({
      userId: user.id,
      senderId: sender.id,
      senderLabel: sender.label,
      hourBucket: `post-${Date.now()}`,
      senderLimit: 3,
      globalLimit: 100,
    });

    await waitFor(async () => (catcher!.bodies.length === 1 ? 1 : false), {
      timeoutMs: 8_000,
      label: "notify after connect",
    });
  });

  it("does not fail email jobs when Slack webhooks error", async () => {
    catcher = await startHttpCatcher(500);
    const mock = installMockSmtp();
    restoreMail = mock.restore;
    const { user, sender } = await createUserWithSender();
    await connectSlack(user.id, catcher.url);

    workers = [createEmailSendWorker()];
    const { campaignId } = await seedImmediateEmails({
      user,
      sender,
      count: 2,
      hourlyLimit: 20,
    });

    const notify = notifyRateLimit({
      userId: user.id,
      senderId: sender.id,
      senderLabel: sender.label,
      hourBucket: `fail-${Date.now()}`,
      senderLimit: 3,
      globalLimit: 100,
    });
    const expectedFail = expect(notify).rejects.toThrow(/Slack webhook failed/);

    await waitFor(async () => {
      const sent = await prisma.email.count({ where: { campaignId, status: EmailStatus.sent } });
      return sent === 2 ? sent : false;
    }, { timeoutMs: 12_000, label: "send despite slack fail" });
    await expectedFail;
    expect(mock.sends).toHaveLength(2);
    expect(await prisma.email.count({ where: { campaignId, status: EmailStatus.failed } })).toBe(0);
  });

  it("dedupes concurrent notify attempts for the same sender hour", async () => {
    catcher = await startHttpCatcher();
    const { user, sender } = await createUserWithSender();
    await connectSlack(user.id, catcher.url);
    const hourBucket = `dup-${Date.now()}`;
    const input = {
      userId: user.id,
      senderId: sender.id,
      senderLabel: sender.label,
      hourBucket,
      senderLimit: 3,
      globalLimit: 100,
    };
    const results = await Promise.all([notifyRateLimit(input), notifyRateLimit(input), notifyRateLimit(input)]);
    expect(results.filter((r) => r === "sent")).toHaveLength(1);
    expect(results.filter((r) => r === "deduped")).toHaveLength(2);
    expect(catcher.bodies).toHaveLength(1);
  });

  it("disconnects Slack without affecting authenticated email APIs", async () => {
    const { user } = await createUserWithSender();
    await connectSlack(user.id, "http://127.0.0.1:9/unused");
    const app = buildApp();
    const agent = await loginAgent(app, user);
    const before = await agent.get("/api/slack/status");
    expect(before.body.connected).toBe(true);
    const del = await agent.delete("/api/slack");
    expect(del.status).toBe(204);
    const after = await agent.get("/api/slack/status");
    expect(after.body.connected).toBe(false);
    const emails = await agent.get("/api/emails");
    expect(emails.status).toBe(200);
  });

  it("rejects a Slack callback with a missing/invalid state", async () => {
    const app = buildApp();
    const res = await request(app).get("/auth/slack/callback?code=x&state=bogus");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_OAUTH_STATE");
  });
});
