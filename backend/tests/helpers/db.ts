import { randomUUID } from "node:crypto";
import type { Sender, User } from "@prisma/client";
import { CampaignStatus, EmailStatus } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { env } from "../../src/config/env";
import { enqueueEmailSendBulk, enqueueSearchIndex } from "../../src/lib/queues";

export async function createUserWithSender(overrides?: { email?: string; googleId?: string }): Promise<{
  user: User;
  sender: Sender;
}> {
  const id = randomUUID();
  const user = await prisma.user.create({
    data: {
      googleId: overrides?.googleId ?? `g-${id}`,
      email: overrides?.email ?? `p2+${id}@example.com`,
      name: "Phase 2 User",
      avatarUrl: "https://example.com/avatar.png",
    },
  });
  const sender = await prisma.sender.create({
    data: {
      userId: user.id,
      label: "Test Sender",
      fromName: "Test Sender",
      fromEmail: "sender@ethereal.email",
      smtpHost: "smtp.ethereal.email",
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: "sender@ethereal.email",
      smtpPass: "not-a-real-password",
      isDefault: true,
    },
  });
  return { user, sender };
}

export async function deletePhase2Users(): Promise<void> {
  await prisma.user.deleteMany({ where: { email: { startsWith: "p2+" } } });
}

export async function seedImmediateEmails(input: {
  user: User;
  sender: Sender;
  count: number;
  hourlyLimit: number;
  subject?: string;
  scheduledAt?: Date;
}): Promise<{ campaignId: string; emailIds: string[] }> {
  const campaignId = randomUUID();
  const scheduledAt = input.scheduledAt ?? new Date();
  const emailRows = Array.from({ length: input.count }, (_, i) => ({
    id: randomUUID(),
    campaignId,
    userId: input.user.id,
    senderId: input.sender.id,
    toEmail: `lead-${i}-${campaignId.slice(0, 8)}@example.com`,
    subject: input.subject ?? "Immediate",
    body: "hello",
    status: EmailStatus.scheduled,
    scheduledAt,
  }));

  await prisma.campaign.create({
    data: {
      id: campaignId,
      userId: input.user.id,
      senderId: input.sender.id,
      subject: input.subject ?? "Immediate",
      body: "hello",
      startAt: scheduledAt,
      delayMs: env.MIN_INTER_EMAIL_MS,
      hourlyLimit: input.hourlyLimit,
      leadCount: input.count,
      status: CampaignStatus.scheduled,
    },
  });
  await prisma.email.createMany({ data: emailRows });
  await enqueueEmailSendBulk(
    emailRows.map((row) => ({
      data: {
        emailId: row.id,
        userId: input.user.id,
        senderId: input.sender.id,
        campaignId,
        delayMs: env.MIN_INTER_EMAIL_MS,
        hourlyLimit: input.hourlyLimit,
      },
      scheduledAt,
    })),
  );
  await Promise.all(emailRows.map((row) => enqueueSearchIndex(row.id).catch(() => undefined)));
  return { campaignId, emailIds: emailRows.map((row) => row.id) };
}
