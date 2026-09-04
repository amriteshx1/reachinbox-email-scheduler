import { DelayedError, Worker } from "bullmq";
import type { Job } from "bullmq";
import { EmailStatus } from "@prisma/client";
import { getTestMessageUrl } from "nodemailer";
import { env } from "../config/env";
import { EMAIL_JOB_OPTIONS, QUEUE_EMAIL_SEND } from "../config/constants";
import { createBullmqConnection, redis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { sendEmail } from "../lib/mailer";
import { htmlToPlainText, looksLikeHtml } from "../lib/html";
import { enqueueSearchIndex, enqueueSlackRateLimit } from "../lib/queues";
import { releaseSendPermit, reserveNextSlot, tryAcquireSendPermit } from "../services/rateLimiter";
import { hourBucketUtc } from "../lib/hours";
import { refreshCampaignStatus } from "../services/scheduler";
import type { EmailSendJobData } from "../types/jobs";

const SMTP_RECEIPT_TTL_SECONDS = 7 * 24 * 60 * 60;

export function smtpReceiptKey(emailId: string): string {
  return `smtp-receipt:${emailId}`;
}

export function createEmailSendWorker(): Worker<EmailSendJobData> {
  const worker = new Worker<EmailSendJobData>(
    QUEUE_EMAIL_SEND,
    async (job, token) => processSend(job, token),
    {
      connection: createBullmqConnection(),
      prefix: env.BULLMQ_PREFIX,
      concurrency: env.WORKER_CONCURRENCY,
      lockDuration: env.WORKER_LOCK_DURATION_MS,
      stalledInterval: Math.max(500, Math.floor(env.WORKER_LOCK_DURATION_MS / 2)),
      maxStalledCount: 2,
    },
  );

  worker.on("completed", (job) => {
    logger.debug({ jobId: job.id }, "email-send completed");
  });
  worker.on("failed", async (job, err) => {
    logger.warn({ jobId: job?.id, err }, "email-send failed");
    if (!job) return;
    const attempts = job.opts.attempts ?? EMAIL_JOB_OPTIONS.attempts;
    if (job.attemptsMade >= attempts) {
      await finalizeFailure(job.data.emailId, job.data.campaignId, err.message);
    }
  });
  worker.on("stalled", (jobId) => {
    logger.warn({ jobId }, "email-send stalled");
  });
  worker.on("error", (err) => {
    logger.error({ err }, "email-send worker error");
  });

  return worker;
}

async function processSend(job: Job<EmailSendJobData>, token?: string): Promise<void> {
  const email = await prisma.email.findUnique({
    where: { id: job.data.emailId },
    include: { sender: true, campaign: true },
  });

  if (!email) {
    logger.warn({ emailId: job.data.emailId }, "email row missing; skipping");
    return;
  }

  if (email.status === EmailStatus.sent) {
    await enqueueSearchIndex(email.id).catch(() => undefined);
    return;
  }

  if (email.status === EmailStatus.sending && email.providerMessageId) {
    await prisma.email.update({
      where: { id: email.id },
      data: {
        status: EmailStatus.sent,
        sentAt: email.sentAt ?? new Date(),
      },
    });
    await enqueueSearchIndex(email.id).catch(() => undefined);
    await refreshCampaignStatus(email.campaignId).catch(() => undefined);
    return;
  }

  if (email.status === EmailStatus.failed) {
    return;
  }

  const receipt = await redis.get(smtpReceiptKey(email.id));
  if (receipt) {
    await prisma.email.update({
      where: { id: email.id },
      data: {
        status: EmailStatus.sent,
        sentAt: email.sentAt ?? new Date(),
        providerMessageId: email.providerMessageId ?? receipt,
      },
    });
    await enqueueSearchIndex(email.id).catch(() => undefined);
    await refreshCampaignStatus(email.campaignId).catch(() => undefined);
    return;
  }

  const delayMs = Math.max(email.campaign.delayMs, env.MIN_INTER_EMAIL_MS, job.data.delayMs);
  const senderLimit = Math.min(email.campaign.hourlyLimit, env.MAX_EMAILS_PER_HOUR_PER_SENDER, job.data.hourlyLimit);
  const globalLimit = env.MAX_EMAILS_PER_HOUR;
  const nowMs = Date.now();

  if (email.scheduledAt.getTime() > nowMs + 250) {
    await job.moveToDelayed(email.scheduledAt.getTime(), token);
    throw new DelayedError();
  }

  const permit = await tryAcquireSendPermit({
    emailId: email.id,
    senderId: email.senderId,
    nowMs,
    minDelayMs: env.MIN_INTER_EMAIL_MS,
    senderLimit,
    globalLimit,
  });

  if (!permit.ok) {
    if (permit.reason === "hourly") {
      const next = await reserveNextSlot({
        senderId: email.senderId,
        nowMs,
        delayMs,
        senderLimit,
        globalLimit,
      });
      await prisma.email.update({
        where: { id: email.id },
        data: { scheduledAt: new Date(next.scheduledAtMs), status: EmailStatus.scheduled },
      });
      await enqueueSearchIndex(email.id).catch(() => undefined);
      await enqueueSlackRateLimit({
        userId: email.userId,
        senderId: email.senderId,
        senderLabel: email.sender.label,
        hourBucket: hourBucketUtc(nowMs),
        senderLimit,
        globalLimit,
      }).catch((err) => logger.warn({ err }, "failed to enqueue slack notify"));

      await job.moveToDelayed(next.scheduledAtMs, token);
      throw new DelayedError();
    }

    await job.moveToDelayed(nowMs + permit.waitMs, token);
    throw new DelayedError();
  }

  const cas = await prisma.email.updateMany({
    where: {
      id: email.id,
      status: EmailStatus.scheduled,
      providerMessageId: null,
    },
    data: { status: EmailStatus.sending },
  });

  if (cas.count === 0) {
    const staleBefore = new Date(Date.now() - env.WORKER_LOCK_DURATION_MS);
    const takeover = await prisma.email.updateMany({
      where: {
        id: email.id,
        status: EmailStatus.sending,
        providerMessageId: null,
        updatedAt: { lte: staleBefore },
      },
      data: { status: EmailStatus.sending, failureReason: null },
    });
    if (takeover.count === 0) {
      // Another worker holds the send, already finished it, or the row vanished.
      // Do not release the per-email permit: that INCR is hourly accounting for a
      // successful/in-flight send. Releasing here would let extra emails through.
      return;
    }
  }

  try {
    const html = looksLikeHtml(email.body) ? email.body : undefined;
    const info = await sendEmail(email.sender, {
      to: email.toEmail,
      subject: email.subject,
      text: html ? htmlToPlainText(email.body) : email.body,
      html,
    });
    const previewUrl = getTestMessageUrl(info);

    await redis.set(smtpReceiptKey(email.id), info.messageId, "EX", SMTP_RECEIPT_TTL_SECONDS);

    await prisma.email.update({
      where: { id: email.id },
      data: {
        status: EmailStatus.sent,
        sentAt: new Date(),
        providerMessageId: info.messageId,
        previewUrl: typeof previewUrl === "string" ? previewUrl : null,
        failureReason: null,
        attempts: { increment: 1 },
      },
    });
    await enqueueSearchIndex(email.id).catch((err) => logger.warn({ err }, "index enqueue after send failed"));
    await refreshCampaignStatus(email.campaignId).catch(() => undefined);
  } catch (err) {
    const persisted = await redis.get(smtpReceiptKey(email.id));
    if (persisted) {
      await prisma.email
        .update({
          where: { id: email.id },
          data: {
            status: EmailStatus.sent,
            sentAt: new Date(),
            providerMessageId: persisted,
            failureReason: null,
          },
        })
        .catch((persistErr) => logger.warn({ persistErr, emailId: email.id }, "failed to persist smtp receipt"));
      await enqueueSearchIndex(email.id).catch(() => undefined);
      await refreshCampaignStatus(email.campaignId).catch(() => undefined);
      return;
    }

    await releaseSendPermit(email.id).catch(() => undefined);
    const message = err instanceof Error ? err.message : "SMTP send failed";
    const maxAttempts = job.opts.attempts ?? EMAIL_JOB_OPTIONS.attempts;
    const exhausted = job.attemptsMade + 1 >= maxAttempts;
    await prisma.email.update({
      where: { id: email.id },
      data: {
        status: exhausted ? EmailStatus.failed : EmailStatus.scheduled,
        failureReason: message,
        failedAt: exhausted ? new Date() : null,
        attempts: { increment: 1 },
      },
    });
    await enqueueSearchIndex(email.id).catch(() => undefined);
    if (exhausted) {
      await refreshCampaignStatus(email.campaignId).catch(() => undefined);
    }
    throw err;
  }
}

async function finalizeFailure(emailId: string, campaignId: string, reason: string): Promise<void> {
  await prisma.email.updateMany({
    where: { id: emailId, status: { not: EmailStatus.sent } },
    data: {
      status: EmailStatus.failed,
      failureReason: reason,
      failedAt: new Date(),
    },
  });
  await enqueueSearchIndex(emailId).catch(() => undefined);
  await refreshCampaignStatus(campaignId).catch(() => undefined);
  await releaseSendPermit(emailId).catch(() => undefined);
}
