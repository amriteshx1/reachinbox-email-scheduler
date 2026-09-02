import { Router } from "express";
import { env } from "../config/env";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, currentUser } from "../middleware/requireAuth";
import {
  createSlackAuthorizeUrl,
  disconnectSlack,
  handleSlackCallback,
  slackConfigured,
  slackStatus,
} from "../services/slack";
import { AppError } from "../lib/errors";

export const slackRouter = Router();

slackRouter.get(
  "/auth/slack",
  requireAuth,
  asyncHandler(async (req, res) => {
    const url = await createSlackAuthorizeUrl(currentUser(req).id);
    res.redirect(url);
  }),
);

slackRouter.get(
  "/auth/slack/callback",
  asyncHandler(async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!code || !state) {
      throw new AppError(400, "MISSING_OAUTH_PARAMS", "Slack did not return code and state");
    }
    await handleSlackCallback(code, state);
    res.redirect(`${env.FRONTEND_URL}/dashboard?slack=connected`);
  }),
);

slackRouter.get(
  "/api/slack/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const status = await slackStatus(currentUser(req).id);
    res.json({ ...status, configured: slackConfigured() });
  }),
);

slackRouter.delete(
  "/api/slack",
  requireAuth,
  asyncHandler(async (req, res) => {
    await disconnectSlack(currentUser(req).id);
    res.status(204).end();
  }),
);
