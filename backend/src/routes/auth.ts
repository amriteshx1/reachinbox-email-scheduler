import { Router } from "express";
import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { applySessionCookiePolicy, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "../config/constants";
import { asyncHandler } from "../middleware/errorHandler";
import { googleAuthUrl, loginWithGoogleCode } from "../services/google";
import { AppError } from "../lib/errors";

export const authRouter = Router();

authRouter.get("/google", (req, res) => {
  const state = randomUUID();
  req.session.oauthState = state;
  applySessionCookiePolicy(req.session.cookie);
  req.session.save((err) => {
    if (err) {
      res.status(500).json({ error: { code: "SESSION_ERROR", message: "Could not start login" } });
      return;
    }
    res.redirect(googleAuthUrl(state));
  });
});

authRouter.get(
  "/google/callback",
  asyncHandler(async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!code) {
      throw new AppError(400, "MISSING_CODE", "Google did not return an authorization code");
    }
    if (!state || state !== req.session.oauthState) {
      throw new AppError(400, "INVALID_OAUTH_STATE", "OAuth state mismatch");
    }
    delete req.session.oauthState;
    const user = await loginWithGoogleCode(code);
    req.session.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    };
    applySessionCookiePolicy(req.session.cookie);
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
    res.redirect(`${env.FRONTEND_URL}/dashboard`);
  }),
);

authRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    if (!req.session.user) {
      throw new AppError(401, "UNAUTHENTICATED", "Login required");
    }
    res.json({ user: req.session.user });
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    await new Promise<void>((resolve, reject) => {
      req.session.destroy((err) => (err ? reject(err) : resolve()));
    });
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: SESSION_COOKIE_OPTIONS.httpOnly,
      sameSite: SESSION_COOKIE_OPTIONS.sameSite,
      secure: SESSION_COOKIE_OPTIONS.secure,
      path: SESSION_COOKIE_OPTIONS.path,
    });
    res.status(204).end();
  }),
);
