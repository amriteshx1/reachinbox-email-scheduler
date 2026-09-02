import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuth, currentUser } from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/errorHandler";
import { parseLeads } from "../services/leads";
import { createCampaign, listCampaigns } from "../services/scheduler";
import { AppError } from "../lib/errors";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const jsonSchema = z.object({
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(50_000),
  startAt: z.coerce.date(),
  delayMs: z.coerce.number().int().positive(),
  hourlyLimit: z.coerce.number().int().positive(),
  senderId: z.string().uuid().optional(),
  leads: z.preprocess((value) => {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return value.split(/\r?\n/);
      }
    }
    return value;
  }, z.array(z.string()).optional()),
  leadsText: z.string().optional(),
});

export const campaignsRouter = Router();

campaignsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const campaigns = await listCampaigns(currentUser(req).id);
    res.json({ campaigns });
  }),
);

campaignsRouter.post(
  "/",
  requireAuth,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const parsed = jsonSchema.parse({
      subject: req.body.subject,
      body: req.body.body,
      startAt: req.body.startAt,
      delayMs: req.body.delayMs,
      hourlyLimit: req.body.hourlyLimit,
      senderId: req.body.senderId || undefined,
      leads: req.body.leads,
      leadsText: req.body.leadsText,
    });

    let leadResult: ReturnType<typeof parseLeads>;
    if (req.file) {
      leadResult = parseLeads(req.file.buffer.toString("utf8"), req.file.originalname);
    } else if (parsed.leads?.length) {
      leadResult = parseLeads(parsed.leads.join("\n"), "leads.txt");
    } else if (parsed.leadsText) {
      leadResult = parseLeads(parsed.leadsText, "leads.txt");
    } else {
      throw new AppError(400, "MISSING_LEADS", "Upload a CSV/text file or provide leads");
    }

    const result = await createCampaign({
      userId: currentUser(req).id,
      subject: parsed.subject,
      body: parsed.body,
      startAt: parsed.startAt,
      delayMs: parsed.delayMs,
      hourlyLimit: parsed.hourlyLimit,
      senderId: parsed.senderId,
      leads: leadResult.emails,
    });

    res.status(201).json({
      ...result,
      skippedInvalid: leadResult.skippedInvalid,
      skippedDuplicate: leadResult.skippedDuplicate,
    });
  }),
);
