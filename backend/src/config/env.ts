import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  API_PUBLIC_URL: z.string().url().default("http://localhost:3001"),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  ELASTICSEARCH_URL: z.string().url().default("http://localhost:9200"),

  SESSION_SECRET: z.string().min(16),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.string().url(),

  SLACK_CLIENT_ID: z.string().optional().default(""),
  SLACK_CLIENT_SECRET: z.string().optional().default(""),
  SLACK_CALLBACK_URL: z.string().url().optional().default("http://localhost:3001/auth/slack/callback"),

  WORKER_ENABLED: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  WORKER_LOCK_DURATION_MS: z.coerce.number().int().positive().default(30_000),
  BULLMQ_PREFIX: z.string().min(1).default("bull"),

  MIN_INTER_EMAIL_MS: z.coerce.number().int().positive().default(2000),
  MAX_EMAILS_PER_HOUR: z.coerce.number().int().positive().default(1000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().positive().default(200),
  MAX_LEADS_PER_CAMPAIGN: z.coerce.number().int().positive().default(5000),

  ETHEREAL_USER: z.string().optional().default(""),
  ETHEREAL_PASS: z.string().optional().default(""),
  ETHEREAL_HOST: z.string().optional().default("smtp.ethereal.email"),
  ETHEREAL_PORT: z.coerce.number().int().positive().default(587),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment: ${JSON.stringify(details)}`);
  }
  return parsed.data;
}

export const env = loadEnv();

export const isProd = env.NODE_ENV === "production";
