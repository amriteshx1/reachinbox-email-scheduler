import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import type { Sender } from "@prisma/client";
import { logger } from "./logger";

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type SendEmailFn = (
  sender: Sender,
  input: SendEmailInput,
) => Promise<SMTPTransport.SentMessageInfo>;

const transporters = new Map<string, Transporter<SMTPTransport.SentMessageInfo>>();
let sendEmailOverride: SendEmailFn | null = null;

export function setSendEmailOverride(fn: SendEmailFn | null): void {
  sendEmailOverride = fn;
}

export function getTransporter(sender: Sender): Transporter<SMTPTransport.SentMessageInfo> {
  const cached = transporters.get(sender.id);
  if (cached) return cached;

  const transporter = nodemailer.createTransport({
    host: sender.smtpHost,
    port: sender.smtpPort,
    secure: sender.smtpSecure,
    auth: {
      user: sender.smtpUser,
      pass: sender.smtpPass,
    },
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });

  transporters.set(sender.id, transporter);
  return transporter;
}

export async function sendEmail(
  sender: Sender,
  input: SendEmailInput,
): Promise<SMTPTransport.SentMessageInfo> {
  if (sendEmailOverride) {
    return sendEmailOverride(sender, input);
  }
  const transporter = getTransporter(sender);
  const info = await transporter.sendMail({
    from: `"${sender.fromName}" <${sender.fromEmail}>`,
    to: input.to,
    subject: input.subject,
    text: input.text,
    ...(input.html ? { html: input.html } : {}),
  });
  logger.debug({ messageId: info.messageId, to: input.to }, "smtp accepted");
  return info;
}

export function previewUrlOf(info: SMTPTransport.SentMessageInfo): string | null {
  const url = nodemailer.getTestMessageUrl(info);
  return typeof url === "string" ? url : null;
}

export async function closeTransporters(): Promise<void> {
  await Promise.all(
    [...transporters.values()].map((t) =>
      t.close(),
    ),
  );
  transporters.clear();
}
