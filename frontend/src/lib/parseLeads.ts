const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LeadsPreview = {
  emails: string[];
  skippedInvalid: number;
  skippedDuplicate: number;
};

export function parseLeadsPreview(content: string, filename: string): LeadsPreview {
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

  return { emails, skippedInvalid, skippedDuplicate };
}

function extractCandidates(content: string, filename: string): string[] {
  const looksCsv = filename.toLowerCase().endsWith(".csv") || firstLineHasComma(content);
  if (!looksCsv) {
    return content.split(/\r?\n/).flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed) return [];
      return [trimmed];
    });
  }

  const rows = content
    .split(/\r?\n/)
    .map((line) => splitCsvLine(line))
    .filter((row) => row.some((cell) => cell.trim().length > 0));
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const emailIdx = header.findIndex((h) => ["email", "email_address", "e-mail", "mail"].includes(h));
  if (emailIdx >= 0) {
    return rows.slice(1).map((row) => row[emailIdx] ?? "");
  }
  if (EMAIL_RE.test((rows[0][0] ?? "").trim())) {
    return rows.map((row) => row[0] ?? "");
  }
  return rows.slice(1).map((row) => row[0] ?? "");
}

function firstLineHasComma(content: string): boolean {
  return (content.split(/\r?\n/, 1)[0] ?? "").includes(",");
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}
