import { randomUUID } from "node:crypto";
import { CampaignStatus, EmailStatus, Prisma } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { enqueueEmailSendBulk, enqueueSearchIndex } from "../lib/queues";
import { packSlots } from "./slotAllocator";
import { withSenderLock } from "./rateLimiter";
import { ensureSenders } from "./senders";
import { logger } from "../lib/logger";

export type CreateCampaignInput = {
  userId: string;
  subject: string;
  body: string;
  startAt: Date;
  delayMs: number;
  hourlyLimit: number;
  senderId?: string;
  leads: string[];
};

export async function createCampaign(input: CreateCampaignInput) {
  const delayMs = Math.max(input.delayMs, env.MIN_INTER_EMAIL_MS);
  const senderHourlyLimit = Math.min(input.hourlyLimit, env.MAX_EMAILS_PER_HOUR_PER_SENDER);
  const globalHourlyLimit = env.MAX_EMAILS_PER_HOUR;

  const senders = await ensureSenders(input.userId);
  const sender =
    (input.senderId ? senders.find((s) => s.id === input.senderId) : senders.find((s) => s.isDefault)) ??
    senders[0];
  if (!sender) {
    throw new AppError(400, "NO_SENDER", "No sender is configured");
  }
  if (input.senderId && sender.id !== input.senderId) {
    throw new AppError(404, "SENDER_NOT_FOUND", "Sender not found");
  }

  return withSenderLock(sender.id, async () => {
    const now = new Date();
    const startAt = input.startAt.getTime() < now.getTime() ? now : input.startAt;
    const horizonStart = startAt;

    const [existingSender, existingGlobal] = await Promise.all([
      prisma.email.findMany({
        where: {
          senderId: sender.id,
          status: { in: [EmailStatus.scheduled, EmailStatus.sending] },
          scheduledAt: { gte: horizonStart },
        },
        select: { scheduledAt: true },
      }),
      prisma.email.findMany({
        where: {
          status: { in: [EmailStatus.scheduled, EmailStatus.sending] },
          scheduledAt: { gte: horizonStart },
        },
        select: { scheduledAt: true },
      }),
    ]);

    const slots = packSlots({
      now,
      startAt,
      count: input.leads.length,
      delayMs,
      senderHourlyLimit,
      globalHourlyLimit,
      existingSender: existingSender.map((e) => e.scheduledAt),
      existingGlobal: existingGlobal.map((e) => e.scheduledAt),
    });

    const campaignId = randomUUID();
    const emailRows = input.leads.map((toEmail, i) => ({
      id: randomUUID(),
      campaignId,
      userId: input.userId,
      senderId: sender.id,
      toEmail,
      subject: input.subject,
      body: input.body,
      status: EmailStatus.scheduled,
      scheduledAt: slots[i]!,
    }));

    await prisma.$transaction(async (tx) => {
      await tx.campaign.create({
        data: {
          id: campaignId,
          userId: input.userId,
          senderId: sender.id,
          subject: input.subject,
          body: input.body,
          startAt,
          delayMs,
          hourlyLimit: senderHourlyLimit,
          leadCount: emailRows.length,
          status: CampaignStatus.scheduled,
        },
      });
      await tx.email.createMany({ data: emailRows });
    });

    await enqueueEmailSendBulk(
      emailRows.map((row) => ({
        data: {
          emailId: row.id,
          userId: input.userId,
          senderId: sender.id,
          campaignId,
          delayMs,
          hourlyLimit: senderHourlyLimit,
        },
        scheduledAt: row.scheduledAt,
      })),
    );

    await Promise.all(emailRows.map((row) => enqueueSearchIndex(row.id, "upsert").catch((err) => {
      logger.warn({ err, emailId: row.id }, "failed to enqueue search index on create");
    })));

    logger.info(
      { campaignId, count: emailRows.length, senderId: sender.id },
      "campaign scheduled",
    );

    return {
      campaignId,
      senderId: sender.id,
      scheduledCount: emailRows.length,
      delayMs,
      hourlyLimit: senderHourlyLimit,
      emails: emailRows.slice(0, 50).map((row) => ({
        id: row.id,
        toEmail: row.toEmail,
        scheduledAt: row.scheduledAt,
      })),
    };
  });
}

export async function listCampaigns(userId: string) {
  return prisma.campaign.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      sender: { select: { id: true, label: true, fromEmail: true } },
      _count: { select: { emails: true } },
    },
  });
}

export async function refreshCampaignStatus(campaignId: string): Promise<void> {
  const counts = await prisma.email.groupBy({
    by: ["status"],
    where: { campaignId },
    _count: { _all: true },
  });
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Record<
    EmailStatus,
    number
  >;
  const scheduled = (byStatus.scheduled ?? 0) + (byStatus.sending ?? 0);
  const failed = byStatus.failed ?? 0;
  const sent = byStatus.sent ?? 0;

  let status: CampaignStatus = CampaignStatus.scheduled;
  if (scheduled > 0 && (sent > 0 || failed > 0)) status = CampaignStatus.sending;
  else if (scheduled === 0 && failed > 0 && sent === 0) status = CampaignStatus.failed;
  else if (scheduled === 0) status = CampaignStatus.completed;

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status },
  });
}

export const emailListStatuses = {
  scheduled: [EmailStatus.scheduled, EmailStatus.sending],
  sent: [EmailStatus.sent, EmailStatus.failed],
  failed: [EmailStatus.failed],
  sending: [EmailStatus.sending],
} as const;

export async function listEmails(input: {
  userId: string;
  status?: keyof typeof emailListStatuses;
  page: number;
  limit: number;
}) {
  const statuses = input.status ? emailListStatuses[input.status] : undefined;
  const where: Prisma.EmailWhereInput = {
    userId: input.userId,
    ...(statuses ? { status: { in: [...statuses] } } : {}),
  };
  const orderBy: Prisma.EmailOrderByWithRelationInput =
    input.status === "sent" ? { sentAt: "desc" } : { scheduledAt: "asc" };

  const [items, total] = await prisma.$transaction([
    prisma.email.findMany({
      where,
      orderBy,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      select: {
        id: true,
        toEmail: true,
        subject: true,
        status: true,
        scheduledAt: true,
        sentAt: true,
        failedAt: true,
        previewUrl: true,
        failureReason: true,
        campaignId: true,
        senderId: true,
      },
    }),
    prisma.email.count({ where }),
  ]);

  return { items, total, page: input.page, limit: input.limit };
}
