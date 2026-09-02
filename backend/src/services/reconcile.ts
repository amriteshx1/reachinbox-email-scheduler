import { EmailStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { emailSendQueue } from "../lib/queues";
import { EMAIL_JOB_OPTIONS, EMAIL_SEND_JOB, sendJobId } from "../config/constants";
import { logger } from "../lib/logger";

export async function reconcileScheduledEmails(): Promise<{ scanned: number; enqueued: number }> {
  const emails = await prisma.email.findMany({
    where: { status: { in: [EmailStatus.scheduled, EmailStatus.sending] } },
    include: { campaign: { select: { delayMs: true, hourlyLimit: true } } },
  });

  let enqueued = 0;
  for (const email of emails) {
    const jobId = sendJobId(email.id);
    const existing = await emailSendQueue.getJob(jobId);
    const delay = Math.max(0, email.scheduledAt.getTime() - Date.now());
    const data = {
      emailId: email.id,
      userId: email.userId,
      senderId: email.senderId,
      campaignId: email.campaignId,
      delayMs: email.campaign.delayMs,
      hourlyLimit: email.campaign.hourlyLimit,
    };

    if (!existing) {
      await emailSendQueue.add(EMAIL_SEND_JOB, data, { jobId, delay, ...EMAIL_JOB_OPTIONS });
      enqueued += 1;
      continue;
    }

    const state = await existing.getState();
    if (state === "completed" || state === "failed") {
      await existing.remove();
      await emailSendQueue.add(EMAIL_SEND_JOB, data, { jobId, delay, ...EMAIL_JOB_OPTIONS });
      enqueued += 1;
    }
  }

  logger.info({ scanned: emails.length, enqueued }, "reconciled scheduled emails");
  return { scanned: emails.length, enqueued };
}
