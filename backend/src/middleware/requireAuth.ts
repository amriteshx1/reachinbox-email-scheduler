import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors";

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.session.user) {
    next(new AppError(401, "UNAUTHENTICATED", "Login required"));
    return;
  }
  next();
}

export function currentUser(req: Request) {
  const user = req.session.user;
  if (!user) {
    throw new AppError(401, "UNAUTHENTICATED", "Login required");
  }
  return user;
}
