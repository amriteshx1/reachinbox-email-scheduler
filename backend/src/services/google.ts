import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { AppError } from "../lib/errors";
import { ensureSenders } from "./senders";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://www.googleapis.com/oauth2/v2/userinfo";

export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_CALLBACK_URL,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH}?${params.toString()}`;
}

export async function loginWithGoogleCode(code: string) {
  const tokenBody = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: env.GOOGLE_CALLBACK_URL,
    grant_type: "authorization_code",
  });

  const tokenRes = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody,
  });
  const tokens = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenRes.ok || !tokens.access_token) {
    logger.warn({ error: tokens.error }, "google token exchange failed");
    throw new AppError(400, "GOOGLE_OAUTH_FAILED", tokens.error ?? "Google authorization failed");
  }

  const profileRes = await fetch(GOOGLE_USERINFO, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const profile = (await profileRes.json()) as {
    id?: string;
    email?: string;
    name?: string;
    picture?: string;
  };
  if (!profile.id || !profile.email) {
    throw new AppError(400, "GOOGLE_PROFILE_FAILED", "Could not read Google profile");
  }

  const user = await prisma.user.upsert({
    where: { googleId: profile.id },
    create: {
      googleId: profile.id,
      email: profile.email,
      name: profile.name ?? profile.email,
      avatarUrl: profile.picture ?? null,
    },
    update: {
      email: profile.email,
      name: profile.name ?? profile.email,
      avatarUrl: profile.picture ?? null,
    },
  });

  try {
    await ensureSenders(user.id);
  } catch (err) {
    logger.warn({ err, userId: user.id }, "sender bootstrap after login failed");
  }

  return user;
}
