import { describe, expect, it } from "vitest";
import { parseLeads } from "../src/services/leads";

describe("parseLeads", () => {
  it("parses a CSV with an email header", () => {
    const csv = "name,email\nAda,ada@example.com\nLinus,linus@example.com\nAda,ada@example.com\nbad,not-an-email";
    const result = parseLeads(csv, "leads.csv");
    expect(result.emails).toEqual(["ada@example.com", "linus@example.com"]);
    expect(result.skippedDuplicate).toBe(1);
    expect(result.skippedInvalid).toBe(1);
  });

  it("parses one address per line", () => {
    const result = parseLeads("a@example.com\nb@example.com\n");
    expect(result.emails).toEqual(["a@example.com", "b@example.com"]);
  });

  it("rejects empty uploads", () => {
    expect(() => parseLeads("not an email\n")).toThrow(/No valid email addresses/);
  });
});
