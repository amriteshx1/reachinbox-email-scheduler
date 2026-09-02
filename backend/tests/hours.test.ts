import { describe, expect, it } from "vitest";
import { hourBucketUtc, hourStartMs, nextHourStartMs } from "../src/lib/hours";

describe("hours", () => {
  it("computes UTC hour buckets from epoch-aligned timestamps", () => {
    const ms = Date.parse("2026-09-01T14:32:10.000Z");
    expect(hourBucketUtc(ms)).toBe("2026090114");
    expect(new Date(hourStartMs(ms)).toISOString()).toBe("2026-09-01T14:00:00.000Z");
    expect(new Date(nextHourStartMs(ms)).toISOString()).toBe("2026-09-01T15:00:00.000Z");
  });
});
