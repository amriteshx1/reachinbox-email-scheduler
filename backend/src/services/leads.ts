import { parse } from "csv-parse/sync";
import { AppError } from "../lib/errors";
import { env } from "../config/env";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ParsedLeads = {
  emails: string[];
  skippedInvalid: number;
  skippedDuplicate: number;
};

export function parseLeads(content: string, filename = "leads.txt"): ParsedLeads {
  const candidates = extractCandidates(content, filename);
  const seen = new Set<string>();
  let skippedInvalid = 0;
  let skippedDuplicate = 0;
  const emails: string[] = [];

  for (const raw of candidates) {
    const email = raw.trim().toLowerCase();
    if (!email) continue;
    if (!EMAIL_RE.test(email)) {
      skippedInvalid += 1;
      continue;
    }
    if (seen.has(email)) {
      skippedDuplicate += 1;
      continue;
    }
    seen.add(email);
    emails.push(email);
  }

  if (emails.length === 0) {
    throw new AppError(400, "NO_VALID_LEADS", "No valid email addresses found in the upload");
  }
  if (emails.length > env.MAX_LEADS_PER_CAMPAIGN) {
    throw new AppError(
      400,
      "TOO_MANY_LEADS",
      `A campaign may include at most ${env.MAX_LEADS_PER_CAMPAIGN} leads`,
    );
  }

  return { emails, skippedInvalid, skippedDuplicate };
}

function extractCandidates(content: string, filename: string): string[] {
  const looksCsv = filename.toLowerCase().endsWith(".csv") || hasCsvShape(content);
  if (looksCsv) {
    const records = parse(content, {
      relaxColumnCount: true,
      skipEmptyLines: true,
      trim: true,
      relaxQuotes: true,
    }) as string[][];
    if (records.length === 0) return [];

    const header = records[0].map((h) => h.toLowerCase());
    const emailIdx = header.findIndex((h) =>
      ["email", "email_address", "e-mail", "mail"].includes(h),
    );
    if (emailIdx >= 0) {
      return records.slice(1).map((row) => row[emailIdx] ?? "");
    }
    if (EMAIL_RE.test((records[0][0] ?? "").trim())) {
      return records.map((row) => row[0] ?? "");
    }
    return records.slice(1).map((row) => row[0] ?? "");
  }

  return content.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    const match = trimmed.match(EMAIL_RE);
    return match ? [match[0]] : [trimmed];
  });
}

function hasCsvShape(content: string): boolean {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  return firstLine.includes(",");
}
