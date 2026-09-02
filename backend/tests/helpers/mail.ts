import { randomUUID } from "node:crypto";
import type { Sender } from "@prisma/client";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { setSendEmailOverride, type SendEmailInput } from "../../src/lib/mailer";

export type RecordedSend = {
  to: string;
  subject: string;
  at: number;
  senderId: string;
};

export function installMockSmtp(): { sends: RecordedSend[]; restore: () => void } {
  const sends: RecordedSend[] = [];
  setSendEmailOverride(async (sender: Sender, input: SendEmailInput) => {
    sends.push({ to: input.to, subject: input.subject, at: Date.now(), senderId: sender.id });
    return {
      messageId: `<mock-${randomUUID()}@ethereal.email>`,
      envelope: { from: sender.fromEmail, to: [input.to] },
      accepted: [input.to],
      rejected: [],
      pending: [],
      response: "250 mock accepted",
    } as SMTPTransport.SentMessageInfo;
  });
  return {
    sends,
    restore: () => setSendEmailOverride(null),
  };
}

export function minGapMs(sends: RecordedSend[]): number {
  if (sends.length < 2) return Number.POSITIVE_INFINITY;
  const times = sends.map((s) => s.at).sort((a, b) => a - b);
  let min = Number.POSITIVE_INFINITY;
  for (let i = 1; i < times.length; i++) {
    min = Math.min(min, times[i]! - times[i - 1]!);
  }
  return min;
}
