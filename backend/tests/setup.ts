import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

process.env.NODE_ENV = "test";
process.env.WORKER_ENABLED = "false";
process.env.MIN_INTER_EMAIL_MS = "100";
process.env.WORKER_LOCK_DURATION_MS = "1000";
process.env.BULLMQ_PREFIX = "bullmq-test";
process.env.WORKER_CONCURRENCY = "4";
process.env.MAX_EMAILS_PER_HOUR = "100000";
process.env.MAX_EMAILS_PER_HOUR_PER_SENDER = "100000";

process.env.DATABASE_URL ??= "postgresql://reachinbox:reachinbox@localhost:5433/reachinbox";
process.env.REDIS_URL ??= "redis://localhost:6380";
process.env.ELASTICSEARCH_URL ??= "http://localhost:9200";
process.env.SESSION_SECRET ??= "test-session-secret-value";
process.env.GOOGLE_CLIENT_ID ??= "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "test-google-client-secret";
process.env.GOOGLE_CALLBACK_URL ??= "http://localhost:3001/auth/google/callback";
process.env.FRONTEND_URL ??= "http://localhost:5173";
process.env.API_PUBLIC_URL ??= "http://localhost:3001";
