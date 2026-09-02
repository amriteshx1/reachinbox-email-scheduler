import express from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import { RedisStore } from "connect-redis";
import { env } from "./config/env";
import { redis } from "./lib/redis";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "./config/constants";
import { errorHandler } from "./middleware/errorHandler";
import { requireAuth } from "./middleware/requireAuth";
import { authRouter } from "./routes/auth";
import { slackRouter } from "./routes/slack";
import { healthRouter } from "./routes/health";
import { sendersRouter } from "./routes/senders";
import { campaignsRouter } from "./routes/campaigns";
import { emailsRouter } from "./routes/emails";
import { createBullBoardAdapter } from "./lib/bullBoard";
import { AppError } from "./lib/errors";
import type { Request, Response, NextFunction } from "express";

export function createApp() {
  const app = express();
  app.set("trust proxy", true);
  app.disable("x-powered-by");

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: new URL(env.FRONTEND_URL).origin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use(
    session({
      name: SESSION_COOKIE,
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      proxy: true,
      rolling: true,
      store: new RedisStore({ client: redis, prefix: "sess:" }),
      cookie: SESSION_COOKIE_OPTIONS,
    }),
  );

  app.use(healthRouter);
  app.use("/auth", authRouter);
  app.use(slackRouter);

  app.use("/api/senders", sendersRouter);
  app.use("/api/campaigns", campaignsRouter);
  app.use("/api/emails", emailsRouter);

  if (env.NODE_ENV === "test") {
    app.post("/__test__/session", (req, res) => {
      req.session.user = req.body.user;
      req.session.save((err) => {
        if (err) {
          res.status(500).json({ error: { code: "SESSION_ERROR", message: "Could not persist test session" } });
          return;
        }
        res.json({ ok: true });
      });
    });
  }

  const bullBoard = createBullBoardAdapter();
  app.use("/admin/queues", requireDashboardAuth, bullBoard.getRouter());

  app.use((_req, _res, next) => {
    next(new AppError(404, "NOT_FOUND", "Not found"));
  });
  app.use(errorHandler);

  return app;
}

function requireDashboardAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session.user) {
    requireAuth(req, res, next);
    return;
  }
  if (req.accepts("html") && !req.path.includes(".")) {
    res.redirect(`${env.FRONTEND_URL}/login`);
    return;
  }
  requireAuth(req, res, next);
}
