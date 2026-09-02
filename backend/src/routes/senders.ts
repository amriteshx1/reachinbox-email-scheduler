import { Router } from "express";
import { requireAuth, currentUser } from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/errorHandler";
import { ensureSenders, listSenders, publicSender } from "../services/senders";

export const sendersRouter = Router();

sendersRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const senders = await listSenders(currentUser(req).id);
    res.json({ senders: senders.map(publicSender) });
  }),
);

sendersRouter.post(
  "/bootstrap",
  requireAuth,
  asyncHandler(async (req, res) => {
    const senders = await ensureSenders(currentUser(req).id);
    res.json({ senders: senders.map(publicSender) });
  }),
);
