import nodemailer from "nodemailer";
import type { Sender } from "@prisma/client";
import { env } from "../config/env";
import { SENDER_COUNT } from "../config/constants";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { AppError } from "../lib/errors";

export function publicSender(sender: Sender) {
  return {
    id: sender.id,
    label: sender.label,
    fromName: sender.fromName,
    fromEmail: sender.fromEmail,
    isDefault: sender.isDefault,
  };
}

export async function listSenders(userId: string) {
  return prisma.sender.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
}

export async function ensureSenders(userId: string): Promise<Sender[]> {
  const existing = await prisma.sender.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  if (existing.length > 0) return existing;

  const created: Sender[] = [];
  for (let i = 0; i < SENDER_COUNT; i++) {
    const account = await createEtherealAccount(i);
    const sender = await prisma.sender.create({
      data: {
        userId,
        label: `Sender ${i + 1}`,
        fromName: `ReachInbox Sender ${i + 1}`,
        fromEmail: account.user,
        smtpHost: account.smtp.host,
        smtpPort: account.smtp.port,
        smtpSecure: account.smtp.secure,
        smtpUser: account.user,
        smtpPass: account.pass,
        isDefault: i === 0,
      },
    });
    created.push(sender);
  }
  logger.info({ userId, count: created.length }, "bootstrapped ethereal senders");
  return created;
}

type EtherealAccount = {
  user: string;
  pass: string;
  smtp: { host: string; port: number; secure: boolean };
};

async function createEtherealAccount(_index: number): Promise<EtherealAccount> {
  if (env.ETHEREAL_USER && env.ETHEREAL_PASS) {
    return {
      user: env.ETHEREAL_USER,
      pass: env.ETHEREAL_PASS,
      smtp: {
        host: env.ETHEREAL_HOST,
        port: env.ETHEREAL_PORT,
        secure: false,
      },
    };
  }

  try {
    const account = await nodemailer.createTestAccount();
    return {
      user: account.user,
      pass: account.pass,
      smtp: {
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
      },
    };
  } catch (err) {
    logger.warn({ err }, "ethereal createTestAccount failed");
    if (env.ETHEREAL_USER && env.ETHEREAL_PASS) {
      return {
        user: env.ETHEREAL_USER,
        pass: env.ETHEREAL_PASS,
        smtp: {
          host: env.ETHEREAL_HOST,
          port: env.ETHEREAL_PORT,
          secure: false,
        },
      };
    }
    throw new AppError(
      503,
      "ETHEREAL_UNAVAILABLE",
      "Could not create an Ethereal SMTP account. Set ETHEREAL_USER and ETHEREAL_PASS or retry.",
    );
  }
}
