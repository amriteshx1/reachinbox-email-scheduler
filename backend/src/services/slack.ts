import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { redis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { AppError } from "../lib/errors";

const SLACK_AUTHORIZE = "https://slack.com/oauth/v2/authorize";
const SLACK_ACCESS = "https://slack.com/api/oauth.v2.access";

export function slackConfigured(): boolean {
  return Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET);
}

export async function createSlackAuthorizeUrl(userId: string): Promise<string> {
  if (!slackConfigured()) {
    throw new AppError(503, "SLACK_NOT_CONFIGURED", "Slack OAuth is not configured");
  }
  const state = randomUUID();
  await redis.set(`oauth:slack:${state}`, userId, "EX", 600);
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    scope: "incoming-webhook",
    redirect_uri: env.SLACK_CALLBACK_URL,
    state,
  });
  return `${SLACK_AUTHORIZE}?${params.toString()}`;
}

export async function handleSlackCallback(code: string, state: string): Promise<string> {
  const userId = await redis.get(`oauth:slack:${state}`);
  await redis.del(`oauth:slack:${state}`);
  if (!userId) {
    throw new AppError(400, "INVALID_OAUTH_STATE", "Slack OAuth state is invalid or expired");
  }

  const body = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    client_secret: env.SLACK_CLIENT_SECRET,
    code,
    redirect_uri: env.SLACK_CALLBACK_URL,
  });

  const response = await fetch(SLACK_ACCESS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await response.json()) as SlackOAuthResponse;
  if (!data.ok || !data.incoming_webhook?.url) {
    logger.warn({ error: data.error }, "slack oauth.v2.access failed");
    throw new AppError(400, "SLACK_OAUTH_FAILED", data.error ?? "Slack authorization failed");
  }

  await prisma.slackConnection.upsert({
    where: { userId },
    create: {
      userId,
      teamId: data.team?.id ?? "unknown",
      teamName: data.team?.name ?? "Slack",
      accessToken: data.access_token ?? "",
      webhookUrl: data.incoming_webhook.url,
      webhookChannel: data.incoming_webhook.channel ?? null,
    },
    update: {
      teamId: data.team?.id ?? "unknown",
      teamName: data.team?.name ?? "Slack",
      accessToken: data.access_token ?? "",
      webhookUrl: data.incoming_webhook.url,
      webhookChannel: data.incoming_webhook.channel ?? null,
    },
  });

  return userId;
}

export async function slackStatus(userId: string) {
  const row = await prisma.slackConnection.findUnique({ where: { userId } });
  if (!row) {
    return { connected: false as const };
  }
  return {
    connected: true as const,
    teamName: row.teamName,
    channel: row.webhookChannel,
  };
}

export async function disconnectSlack(userId: string): Promise<void> {
  await prisma.slackConnection.deleteMany({ where: { userId } });
}

export async function notifyRateLimit(input: {
  userId: string;
  senderId: string;
  senderLabel: string;
  hourBucket: string;
  senderLimit: number;
  globalLimit: number;
}): Promise<"sent" | "skipped" | "deduped"> {
  const connection = await prisma.slackConnection.findUnique({ where: { userId: input.userId } });
  if (!connection) {
    logger.info({ userId: input.userId }, "slack not connected; skipping rate-limit notify");
    return "skipped";
  }

  const dedupKey = `slack:rl:${input.userId}:${input.senderId}:${input.hourBucket}`;
  const acquired = await redis.set(dedupKey, "1", "EX", 7200, "NX");
  if (acquired !== "OK") {
    return "deduped";
  }

  const text = [
    `:rotating_light: Hourly email limit reached`,
    `Sender: ${input.senderLabel} (\`${input.senderId}\`)`,
    `Hour window (UTC): ${input.hourBucket}`,
    `Per-sender cap: ${input.senderLimit}`,
    `Global cap: ${input.globalLimit}`,
    `Overflow jobs are being delayed into the next available hour — they were not dropped.`,
  ].join("\n");

  try {
    const res = await fetch(connection.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const bodyText = await res.text();
      await redis.del(dedupKey);
      throw new Error(`Slack webhook failed: ${res.status} ${bodyText}`);
    }
    return "sent";
  } catch (err) {
    await redis.del(dedupKey);
    throw err;
  }
}

type SlackOAuthResponse = {
  ok: boolean;
  error?: string;
  access_token?: string;
  team?: { id?: string; name?: string };
  incoming_webhook?: { url?: string; channel?: string };
};
