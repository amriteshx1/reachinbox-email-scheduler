import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Worker } from "bullmq";
import { EmailStatus } from "@prisma/client";
import { es } from "../../src/lib/es";
import { EMAIL_INDEX, INDEX_JOB_OPTIONS } from "../../src/config/constants";
import { prisma } from "../../src/lib/prisma";
import { createEmailSendWorker } from "../../src/workers/emailSend";
import { createSearchIndexWorker } from "../../src/workers/searchIndex";
import { upsertEmailDocument } from "../../src/services/search";
import { preparePhase2, buildApp, loginAgent, stopAndDrain } from "../helpers/app";
import { createUserWithSender, deletePhase2Users, seedImmediateEmails } from "../helpers/db";
import { installMockSmtp } from "../helpers/mail";
import { waitFor } from "../helpers/wait";

describe("elasticsearch indexing, retry, and search fallback", () => {
  let workers: Worker[] = [];
  let restoreMail: () => void = () => undefined;

  beforeAll(async () => {
    await preparePhase2();
  });

  afterEach(async () => {
    await stopAndDrain(workers);
    workers = [];
    restoreMail();
    vi.restoreAllMocks();
    await deletePhase2Users();
  });

  it("indexes scheduled emails and returns elasticsearch search hits", async () => {
    const { user, sender } = await createUserWithSender();
    const needle = `unique-subject-${Date.now()}`;
    workers = [createSearchIndexWorker()];
    const { emailIds } = await seedImmediateEmails({
      user,
      sender,
      count: 1,
      hourlyLimit: 20,
      subject: needle,
    });

    await waitFor(async () => {
      await es.indices.refresh({ index: EMAIL_INDEX }).catch(() => undefined);
      const found = await es.search({
        index: EMAIL_INDEX,
        query: { bool: { must: [{ term: { userId: user.id } }, { match: { subject: needle } }] } },
      });
      const total = typeof found.hits.total === "number" ? found.hits.total : found.hits.total?.value ?? 0;
      return total > 0 ? found : false;
    }, { timeoutMs: 15_000, label: "es index" });

    const app = buildApp();
    const agent = await loginAgent(app, user);
    const res = await agent.get(`/api/emails/search?q=${encodeURIComponent(needle)}`);
    expect(res.status).toBe(200);
    expect(res.headers["x-search-source"]).toBe("elasticsearch");
    expect(res.body.items.some((item: { id: string }) => item.id === emailIds[0])).toBe(true);
  });

  it("retries failed elasticsearch indexing", async () => {
    const original = es.index.bind(es);
    let attempts = 0;
    vi.spyOn(es, "index").mockImplementation(async (params) => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("elasticsearch temporarily unavailable");
      }
      return original(params as Parameters<typeof original>[0]);
    });

    const { user, sender } = await createUserWithSender();
    workers = [createSearchIndexWorker()];
    const { emailIds } = await seedImmediateEmails({
      user,
      sender,
      count: 1,
      hourlyLimit: 20,
      subject: "retry-index",
    });

    await waitFor(async () => (attempts >= 3 ? attempts : false), {
      timeoutMs: 15_000,
      label: "index retries",
    });
    expect(attempts).toBeGreaterThanOrEqual(3);
    expect(INDEX_JOB_OPTIONS.attempts).toBeGreaterThanOrEqual(5);
    expect(emailIds).toHaveLength(1);
  });

  it("falls back to postgres when elasticsearch is down", async () => {
    const { user, sender } = await createUserWithSender();
    const needle = `pg-fallback-${Date.now()}`;
    await seedImmediateEmails({
      user,
      sender,
      count: 1,
      hourlyLimit: 20,
      subject: needle,
    });

    vi.spyOn(es, "ping").mockImplementation(async () => false);

    const app = buildApp();
    const agent = await loginAgent(app, user);
    const res = await agent.get(`/api/emails/search?q=${encodeURIComponent(needle)}`);
    expect(res.status).toBe(200);
    expect(res.headers["x-search-source"]).toBe("postgres");
    expect(res.body.items[0]?.subject).toBe(needle);
  });

  it("keeps sending email when elasticsearch indexing fails", async () => {
    const mock = installMockSmtp();
    restoreMail = mock.restore;
    vi.spyOn(es, "index").mockRejectedValue(new Error("es down"));

    const { user, sender } = await createUserWithSender();
    workers = [createEmailSendWorker()];
    const { campaignId } = await seedImmediateEmails({
      user,
      sender,
      count: 2,
      hourlyLimit: 20,
    });

    await waitFor(async () => {
      const sent = await prisma.email.count({ where: { campaignId, status: EmailStatus.sent } });
      return sent === 2 ? sent : false;
    }, { timeoutMs: 12_000, label: "send despite es" });

    expect(mock.sends).toHaveLength(2);
  });

  it("reindexes user emails from postgres", async () => {
    const { user, sender } = await createUserWithSender();
    const { emailIds } = await seedImmediateEmails({
      user,
      sender,
      count: 1,
      hourlyLimit: 20,
      subject: "reindex-me",
    });
    await upsertEmailDocument(emailIds[0]!);
    await es.delete({ index: EMAIL_INDEX, id: emailIds[0]!, refresh: true }).catch(() => undefined);

    workers = [createSearchIndexWorker()];
    const app = buildApp();
    const agent = await loginAgent(app, user);
    const queued = await agent.post("/api/emails/reindex");
    expect(queued.status).toBe(200);
    expect(queued.body.queued).toBeGreaterThanOrEqual(1);

    await waitFor(async () => {
      try {
        const doc = await es.get({ index: EMAIL_INDEX, id: emailIds[0]! });
        return doc.found ? doc : false;
      } catch {
        return false;
      }
    }, { timeoutMs: 10_000, label: "reindex restore" });
  });
});
