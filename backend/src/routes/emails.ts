import { Router } from "express";
import { z } from "zod";
import { requireAuth, currentUser } from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/errorHandler";
import { emailListStatuses, listEmails } from "../services/scheduler";
import { reindexUserEmails, searchEmails } from "../services/search";

const listQuery = z.object({
  status: z.enum(["scheduled", "sent", "failed", "sending"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

const searchQuery = listQuery.extend({
  q: z.string().default(""),
});

export const emailsRouter = Router();

emailsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const query = listQuery.parse(req.query);
    const result = await listEmails({
      userId: currentUser(req).id,
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
    res.json(result);
  }),
);

emailsRouter.get(
  "/search",
  requireAuth,
  asyncHandler(async (req, res) => {
    const query = searchQuery.parse(req.query);
    const result = await searchEmails({
      userId: currentUser(req).id,
      q: query.q,
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
    res.setHeader("X-Search-Source", result.source);
    res.json(result);
  }),
);

emailsRouter.post(
  "/reindex",
  requireAuth,
  asyncHandler(async (req, res) => {
    const queued = await reindexUserEmails(currentUser(req).id);
    res.json({ queued });
  }),
);

export type EmailListStatus = keyof typeof emailListStatuses;
