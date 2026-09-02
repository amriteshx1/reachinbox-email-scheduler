import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { sendJobId, indexJobId, slackJobId } from "../src/config/constants";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("no cron / no polling scheduler / no secret leaks", () => {
  const srcRoot = path.resolve(__dirname, "../src");
  const files = walk(srcRoot);
  const sources = files.map((file) => ({ file, text: readFileSync(file, "utf8") }));

  it("does not introduce cron libraries or periodic DB polling", () => {
    const hits: string[] = [];
    for (const { file, text } of sources) {
      if (/\bnode-cron\b|\bagenda\b|\bcrontab\b|\bcron\.schedule\b/.test(text)) {
        hits.push(`${file}: cron-like import`);
      }
      if (/setInterval\s*\([^)]*(prisma|email|schedule|poll)/i.test(text)) {
        hits.push(`${file}: interval polling`);
      }
    }
    expect(hits).toEqual([]);
    expect(files.length).toBeGreaterThan(10);
  });

  it("keeps oauth secrets out of log statements", () => {
    const hits: string[] = [];
    for (const { file, text } of sources) {
      if (/logger\.[a-z]+\([^)]*GOOGLE_CLIENT_SECRET/.test(text)) hits.push(`${file}: google secret log`);
      if (/logger\.[a-z]+\([^)]*SLACK_CLIENT_SECRET/.test(text)) hits.push(`${file}: slack secret log`);
      if (/logger\.[a-z]+\([^)]*smtpPass/.test(text)) hits.push(`${file}: smtp pass log`);
      if (/logger\.[a-z]+\([^)]*access_token/.test(text)) hits.push(`${file}: access_token log`);
    }
    expect(hits).toEqual([]);
  });

  it("gates the test session hook behind NODE_ENV=test", () => {
    const app = sources.find((s) => s.file.endsWith(`${path.sep}app.ts`));
    expect(app?.text).toContain('env.NODE_ENV === "test"');
    expect(app?.text).toContain("/__test__/session");
  });

  it("uses BullMQ custom job ids without colons", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(sendJobId(id)).not.toContain(":");
    expect(indexJobId(id)).not.toContain(":");
    expect(slackJobId(id, id, "2026090114")).not.toContain(":");
  });
});
