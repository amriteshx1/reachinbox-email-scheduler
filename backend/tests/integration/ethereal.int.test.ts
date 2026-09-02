import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Worker } from "bullmq";
import nodemailer from "nodemailer";
import { EmailStatus } from "@prisma/client";
import { env } from "../../src/config/env";
import { prisma } from "../../src/lib/prisma";
import { createEmailSendWorker } from "../../src/workers/emailSend";
import { preparePhase2, stopAndDrain } from "../helpers/app";
import { createUserWithSender, deletePhase2Users, seedImmediateEmails } from "../helpers/db";
import { waitFor } from "../helpers/wait";

describe("ethereal live send path", () => {
  let workers: Worker[] = [];

  beforeAll(async () => {
    await preparePhase2();
  });

  afterEach(async () => {
    await stopAndDrain(workers);
    workers = [];
    await deletePhase2Users();
  });

  it("sends a small live batch and persists provider id + preview URL", async (ctx) => {
    let smtp: { user: string; pass: string; host: string; port: number };
    try {
      if (env.ETHEREAL_USER && env.ETHEREAL_PASS) {
        smtp = {
          user: env.ETHEREAL_USER,
          pass: env.ETHEREAL_PASS,
          host: env.ETHEREAL_HOST,
          port: env.ETHEREAL_PORT,
        };
      } else {
        const account = await nodemailer.createTestAccount();
        smtp = {
          user: account.user,
          pass: account.pass,
          host: account.smtp.host,
          port: account.smtp.port,
        };
      }
    } catch {
      ctx.skip();
      return;
    }

    const { user, sender } = await createUserWithSender();
    await prisma.sender.update({
      where: { id: sender.id },
      data: {
        fromEmail: smtp.user,
        smtpHost: smtp.host,
        smtpPort: smtp.port,
        smtpUser: smtp.user,
        smtpPass: smtp.pass,
        smtpSecure: false,
      },
    });

    workers = [createEmailSendWorker()];
    const { campaignId, emailIds } = await seedImmediateEmails({
      user,
      sender,
      count: 2,
      hourlyLimit: 20,
      subject: "Ethereal live probe",
    });

    await waitFor(async () => {
      const sent = await prisma.email.count({ where: { campaignId, status: EmailStatus.sent } });
      return sent === 2 ? sent : false;
    }, { timeoutMs: 30_000, label: "ethereal live send" });

    const rows = await prisma.email.findMany({ where: { id: { in: emailIds } } });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.status).toBe(EmailStatus.sent);
      expect(row.providerMessageId).toBeTruthy();
      expect(row.previewUrl).toMatch(/^https:\/\/ethereal\.email\//);
    }
  });
});
