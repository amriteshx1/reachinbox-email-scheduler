import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Worker } from "bullmq";
import { EmailStatus } from "@prisma/client";
import { env } from "../../src/config/env";
import { prisma } from "../../src/lib/prisma";
import { redis } from "../../src/lib/redis";
import { emailSendQueue } from "../../src/lib/queues";
import { sendJobId } from "../../src/config/constants";
import { createEmailSendWorker, smtpReceiptKey } from "../../src/workers/emailSend";
import { reconcileScheduledEmails } from "../../src/services/reconcile";
import { hourBucketUtc } from "../../src/lib/hours";
import { preparePhase2, stopAndDrain } from "../helpers/app";
import { createUserWithSender, deletePhase2Users, seedImmediateEmails } from "../helpers/db";
import { installMockSmtp, minGapMs } from "../helpers/mail";
import { waitFor, sleep } from "../helpers/wait";

describe("workers: delay, concurrency, rate limit, crash, idempotency", () => {
  let workers: Worker[] = [];
  let restoreMail: () => void = () => undefined;

  beforeAll(async () => {
    await preparePhase2();
  });

  afterEach(async () => {
    restoreMail();
    await stopAndDrain(workers);
    workers = [];
    await deletePhase2Users();
  });

  it("sends concurrent jobs from two workers without duplicates", async () => {
    const mock = installMockSmtp();
    restoreMail = mock.restore;
    const { user, sender } = await createUserWithSender();
    workers = [createEmailSendWorker(), createEmailSendWorker()];
    const { campaignId } = await seedImmediateEmails({
      user,
      sender,
      count: 8,
      hourlyLimit: 50,
    });

    await waitFor(async () => {
      const sent = await prisma.email.count({ where: { campaignId, status: EmailStatus.sent } });
      return sent === 8 ? sent : false;
    }, { timeoutMs: 20_000, label: "eight concurrent sends" });

    expect(mock.sends).toHaveLength(8);
    expect(new Set(mock.sends.map((s) => s.to)).size).toBe(8);
  });

  it("enforces per-sender min delay across two workers", async () => {
    const mock = installMockSmtp();
    restoreMail = mock.restore;
    const { user, sender } = await createUserWithSender();
    workers = [createEmailSendWorker(), createEmailSendWorker()];
    const { campaignId } = await seedImmediateEmails({
      user,
      sender,
      count: 6,
      hourlyLimit: 50,
    });

    await waitFor(async () => {
      const sent = await prisma.email.count({ where: { campaignId, status: EmailStatus.sent } });
      return sent === 6 ? sent : false;
    }, { timeoutMs: 15_000, label: "six sends" });

    expect(mock.sends).toHaveLength(6);
    expect(minGapMs(mock.sends)).toBeGreaterThanOrEqual(env.MIN_INTER_EMAIL_MS - 25);
  });

  it("does not double-send the same email when two jobs race", async () => {
    const mock = installMockSmtp();
    restoreMail = mock.restore;
    const { user, sender } = await createUserWithSender();
    const { campaignId, emailIds } = await seedImmediateEmails({
      user,
      sender,
      count: 1,
      hourlyLimit: 20,
    });
    const emailId = emailIds[0]!;
    await emailSendQueue.add(
      "send",
      {
        emailId,
        userId: user.id,
        senderId: sender.id,
        campaignId,
        delayMs: env.MIN_INTER_EMAIL_MS,
        hourlyLimit: 20,
      },
      { jobId: `dup-${emailId}` },
    );

    workers = [createEmailSendWorker(), createEmailSendWorker()];
    await waitFor(async () => {
      const row = await prisma.email.findUnique({ where: { id: emailId } });
      return row?.status === EmailStatus.sent ? row : false;
    }, { timeoutMs: 10_000, label: "raced email sent" });

    await sleep(400);
    expect(mock.sends.filter((s) => s.to.startsWith("lead-0-"))).toHaveLength(1);
    const counted = Number(await redis.get(`rl:s:${sender.id}:${hourBucketUtc(Date.now())}`));
    expect(counted).toBe(1);
  });

  it("skips SMTP when the row is already sent", async () => {
    const mock = installMockSmtp();
    restoreMail = mock.restore;
    const { user, sender } = await createUserWithSender();
    const { emailIds } = await seedImmediateEmails({
      user,
      sender,
      count: 1,
      hourlyLimit: 20,
    });
    await prisma.email.update({
      where: { id: emailIds[0] },
      data: {
        status: EmailStatus.sent,
        sentAt: new Date(),
        providerMessageId: "already-there",
      },
    });
    workers = [createEmailSendWorker()];
    await sleep(800);
    expect(mock.sends).toHaveLength(0);
    const row = await prisma.email.findUnique({ where: { id: emailIds[0] } });
    expect(row?.status).toBe(EmailStatus.sent);
    expect(row?.providerMessageId).toBe("already-there");
  });

  it("does not resend after a crash window if an SMTP receipt exists", async () => {
    const mock = installMockSmtp();
    restoreMail = mock.restore;
    const { user, sender } = await createUserWithSender();
    const { emailIds } = await seedImmediateEmails({
      user,
      sender,
      count: 1,
      hourlyLimit: 20,
    });
    const emailId = emailIds[0]!;
    await redis.set(smtpReceiptKey(emailId), "<crashed-send@ethereal.email>", "EX", 3600);
    workers = [createEmailSendWorker()];
    await waitFor(async () => {
      const row = await prisma.email.findUnique({ where: { id: emailId } });
      return row?.status === EmailStatus.sent ? row : false;
    }, { timeoutMs: 10_000, label: "receipt recovery" });
    expect(mock.sends).toHaveLength(0);
    const row = await prisma.email.findUnique({ where: { id: emailId } });
    expect(row?.providerMessageId).toBe("<crashed-send@ethereal.email>");
  });

  it("reschedules overflow into the next hour instead of failing or dropping", async () => {
    const mock = installMockSmtp();
    restoreMail = mock.restore;
    const { user, sender } = await createUserWithSender();
    workers = [createEmailSendWorker(), createEmailSendWorker()];
    const { campaignId, emailIds } = await seedImmediateEmails({
      user,
      sender,
      count: 8,
      hourlyLimit: 3,
    });

    await waitFor(async () => {
      const sent = await prisma.email.count({ where: { campaignId, status: EmailStatus.sent } });
      return sent >= 3 ? sent : false;
    }, { timeoutMs: 12_000, label: "hourly cap sends" });

    await sleep(600);
    const rows = await prisma.email.findMany({ where: { campaignId } });
    expect(rows.filter((r) => r.status === EmailStatus.failed)).toHaveLength(0);
    expect(rows.filter((r) => r.status === EmailStatus.sent)).toHaveLength(3);
    expect(mock.sends).toHaveLength(3);

    const overflow = rows.filter((r) => r.status === EmailStatus.scheduled);
    expect(overflow.length).toBeGreaterThanOrEqual(5);
    const nowHour = hourBucketUtc(Date.now());
    for (const row of overflow) {
      expect(hourBucketUtc(row.scheduledAt.getTime())).not.toBe(nowHour);
    }
    const overflowTimes = overflow.map((r) => r.scheduledAt.getTime()).sort((a, b) => a - b);
    for (let i = 1; i < overflowTimes.length; i++) {
      expect(overflowTimes[i]).toBeGreaterThanOrEqual(overflowTimes[i - 1]!);
    }

    const delayedStates = await Promise.all(
      emailIds.map(async (id) => {
        const job = await emailSendQueue.getJob(sendJobId(id));
        return job ? job.getState() : "missing";
      }),
    );
    expect(delayedStates.filter((s) => s === "delayed").length).toBeGreaterThanOrEqual(4);
  });

  it("rehydrates delayed jobs from postgres on worker boot", async () => {
    const mock = installMockSmtp();
    restoreMail = mock.restore;
    const { user, sender } = await createUserWithSender();
    const { emailIds } = await seedImmediateEmails({
      user,
      sender,
      count: 2,
      hourlyLimit: 20,
    });
    for (const id of emailIds) {
      const job = await emailSendQueue.getJob(sendJobId(id));
      await job?.remove();
    }
    expect(await emailSendQueue.getJob(sendJobId(emailIds[0]!))).toBeFalsy();

    const result = await reconcileScheduledEmails();
    expect(result.enqueued).toBeGreaterThanOrEqual(2);
    workers = [createEmailSendWorker()];
    await waitFor(async () => {
      const sent = await prisma.email.count({
        where: { id: { in: emailIds }, status: EmailStatus.sent },
      });
      return sent === 2 ? sent : false;
    }, { timeoutMs: 10_000, label: "reconcile send" });
    expect(mock.sends).toHaveLength(2);
  });

  it("recovers a stalled sending row without a provider message id", async () => {
    const mock = installMockSmtp();
    restoreMail = mock.restore;
    const { user, sender } = await createUserWithSender();
    const { emailIds } = await seedImmediateEmails({
      user,
      sender,
      count: 1,
      hourlyLimit: 20,
    });
    const emailId = emailIds[0]!;
    const job = await emailSendQueue.getJob(sendJobId(emailId));
    await job?.remove();
    await prisma.email.update({
      where: { id: emailId },
      data: { status: EmailStatus.sending, providerMessageId: null },
    });
    await sleep(1_200);

    await reconcileScheduledEmails();
    workers = [createEmailSendWorker()];
    await waitFor(async () => {
      const row = await prisma.email.findUnique({ where: { id: emailId } });
      return row?.status === EmailStatus.sent ? row : false;
    }, { timeoutMs: 10_000, label: "stale sending takeover" });
    expect(mock.sends).toHaveLength(1);
  });

  it("keeps delayed jobs across a worker restart", async () => {
    const mock = installMockSmtp();
    restoreMail = mock.restore;
    const { user, sender } = await createUserWithSender();
    const { emailIds } = await seedImmediateEmails({
      user,
      sender,
      count: 1,
      hourlyLimit: 20,
      scheduledAt: new Date(Date.now() + 1_500),
    });
    const emailId = emailIds[0]!;
    const job = await emailSendQueue.getJob(sendJobId(emailId));
    expect(await job?.getState()).toBe("delayed");

    const first = createEmailSendWorker();
    await sleep(200);
    await first.close();
    expect(mock.sends).toHaveLength(0);

    workers = [createEmailSendWorker()];
    await waitFor(async () => {
      const row = await prisma.email.findUnique({ where: { id: emailId } });
      return row?.status === EmailStatus.sent ? row : false;
    }, { timeoutMs: 10_000, label: "send after worker restart" });
    expect(mock.sends).toHaveLength(1);
  });
});
