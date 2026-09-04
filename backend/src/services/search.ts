import type { Email } from "@prisma/client";
import { EMAIL_INDEX } from "../config/constants";
import { es, pingElasticsearch } from "../lib/es";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { EmailStatus, Prisma } from "@prisma/client";
import { emailListStatuses } from "./scheduler";
import { htmlToPlainText, looksLikeHtml } from "../lib/html";

export type EmailSearchHit = {
  id: string;
  toEmail: string;
  subject: string;
  status: EmailStatus;
  scheduledAt: Date;
  sentAt: Date | null;
  previewUrl: string | null;
  failureReason: string | null;
};

function toDocument(email: Email) {
  return {
    userId: email.userId,
    campaignId: email.campaignId,
    senderId: email.senderId,
    toEmail: email.toEmail,
    subject: email.subject,
    body: looksLikeHtml(email.body) ? htmlToPlainText(email.body) : email.body,
    status: email.status,
    scheduledAt: email.scheduledAt,
    sentAt: email.sentAt,
    previewUrl: email.previewUrl,
    failureReason: email.failureReason,
  };
}

export async function upsertEmailDocument(emailId: string): Promise<void> {
  const email = await prisma.email.findUnique({ where: { id: emailId } });
  if (!email) {
    await es.delete({ index: EMAIL_INDEX, id: emailId, refresh: false }).catch(() => undefined);
    return;
  }
  await es.index({
    index: EMAIL_INDEX,
    id: email.id,
    document: toDocument(email),
    refresh: false,
  });
}

export async function deleteEmailDocument(emailId: string): Promise<void> {
  await es.delete({ index: EMAIL_INDEX, id: emailId, refresh: false }).catch((err: { meta?: { statusCode?: number } }) => {
    if (err.meta?.statusCode !== 404) throw err;
  });
}

export async function searchEmails(input: {
  userId: string;
  q: string;
  status?: keyof typeof emailListStatuses;
  page: number;
  limit: number;
}): Promise<{ items: EmailSearchHit[]; total: number; source: "elasticsearch" | "postgres" }> {
  const esUp = await pingElasticsearch();
  if (esUp) {
    try {
      return { ...(await searchElastic(input)), source: "elasticsearch" };
    } catch (err) {
      logger.warn({ err }, "elasticsearch search failed, falling back to postgres");
    }
  }
  return { ...(await searchPostgres(input)), source: "postgres" };
}

async function searchElastic(input: {
  userId: string;
  q: string;
  status?: keyof typeof emailListStatuses;
  page: number;
  limit: number;
}): Promise<{ items: EmailSearchHit[]; total: number }> {
  const statuses = input.status ? [...emailListStatuses[input.status]] : undefined;
  const must: object[] = [{ term: { userId: input.userId } }];
  if (statuses && statuses.length === 1) {
    must.push({ term: { status: statuses[0] } });
  } else if (statuses && statuses.length > 1) {
    must.push({ terms: { status: statuses } });
  }
  if (input.q.trim()) {
    must.push({
      multi_match: {
        query: input.q.trim(),
        fields: ["toEmail", "toEmail.text", "subject", "body"],
        type: "best_fields",
        fuzziness: "AUTO",
      },
    });
  }

  const from = (input.page - 1) * input.limit;
  const result = await es.search({
    index: EMAIL_INDEX,
    from,
    size: input.limit,
    query: { bool: { must } },
    sort: [{ scheduledAt: { order: "asc" } }],
  });

  const hits = result.hits.hits;
  const ids = hits.map((h) => String(h._id));
  const emails = await prisma.email.findMany({
    where: { id: { in: ids }, userId: input.userId },
  });
  const byId = new Map(emails.map((e) => [e.id, e]));
  const items = ids
    .map((id) => byId.get(id))
    .filter((e): e is Email => Boolean(e))
    .map(toHit);

  const total =
    typeof result.hits.total === "number" ? result.hits.total : result.hits.total?.value ?? items.length;

  return { items, total };
}

async function searchPostgres(input: {
  userId: string;
  q: string;
  status?: keyof typeof emailListStatuses;
  page: number;
  limit: number;
}): Promise<{ items: EmailSearchHit[]; total: number }> {
  const statuses = input.status ? [...emailListStatuses[input.status]] : undefined;
  const q = input.q.trim();
  const where: Prisma.EmailWhereInput = {
    userId: input.userId,
    ...(statuses ? { status: { in: statuses } } : {}),
    ...(q
      ? {
          OR: [
            { toEmail: { contains: q, mode: "insensitive" } },
            { subject: { contains: q, mode: "insensitive" } },
            { body: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.email.findMany({
      where,
      orderBy: { scheduledAt: "asc" },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.email.count({ where }),
  ]);

  return { items: rows.map(toHit), total };
}

function toHit(email: Email): EmailSearchHit {
  return {
    id: email.id,
    toEmail: email.toEmail,
    subject: email.subject,
    status: email.status,
    scheduledAt: email.scheduledAt,
    sentAt: email.sentAt,
    previewUrl: email.previewUrl,
    failureReason: email.failureReason,
  };
}

export async function reindexUserEmails(userId: string): Promise<number> {
  const emails = await prisma.email.findMany({ where: { userId }, select: { id: true } });
  const { enqueueSearchIndex } = await import("../lib/queues");
  for (const email of emails) {
    await enqueueSearchIndex(email.id, "upsert");
  }
  return emails.length;
}
