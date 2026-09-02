import { describe, expect, it } from "vitest";
import { packSlots } from "../src/services/slotAllocator";
import { hourBucketUtc } from "../src/lib/hours";

const startAt = new Date("2026-09-01T14:00:00.000Z");
const now = new Date("2026-09-01T13:00:00.000Z");

describe("packSlots", () => {
  it("staggers emails by delay within the same hour", () => {
    const slots = packSlots({
      now,
      startAt,
      count: 3,
      delayMs: 2_000,
      senderHourlyLimit: 200,
      globalHourlyLimit: 1000,
      existingSender: [],
      existingGlobal: [],
    });

    expect(slots).toHaveLength(3);
    expect(slots[0]?.toISOString()).toBe("2026-09-01T14:00:00.000Z");
    expect(slots[1]?.toISOString()).toBe("2026-09-01T14:00:02.000Z");
    expect(slots[2]?.toISOString()).toBe("2026-09-01T14:00:04.000Z");
  });

  it("spills into the next hour when the sender hourly cap is reached", () => {
    const slots = packSlots({
      now,
      startAt,
      count: 5,
      delayMs: 2_000,
      senderHourlyLimit: 3,
      globalHourlyLimit: 1000,
      existingSender: [],
      existingGlobal: [],
    });

    expect(slots.slice(0, 3).every((d) => hourBucketUtc(d.getTime()) === "2026090114")).toBe(true);
    expect(slots[3]?.toISOString()).toBe("2026-09-01T15:00:00.000Z");
    expect(slots[4]?.toISOString()).toBe("2026-09-01T15:00:02.000Z");
  });

  it("packs around already scheduled sender emails", () => {
    const slots = packSlots({
      now,
      startAt,
      count: 2,
      delayMs: 2_000,
      senderHourlyLimit: 3,
      globalHourlyLimit: 1000,
      existingSender: [
        new Date("2026-09-01T14:00:00.000Z"),
        new Date("2026-09-01T14:00:02.000Z"),
        new Date("2026-09-01T14:00:04.000Z"),
      ],
      existingGlobal: [],
    });

    expect(slots[0]?.toISOString()).toBe("2026-09-01T15:00:00.000Z");
    expect(slots[1]?.toISOString()).toBe("2026-09-01T15:00:02.000Z");
  });

  it("packs a campaign whose start time is more than 48 hours in the future", () => {
    const farStart = new Date("2030-01-01T14:00:00.000Z");
    const slots = packSlots({
      now: new Date("2026-09-01T13:00:00.000Z"),
      startAt: farStart,
      count: 3,
      delayMs: 2_000,
      senderHourlyLimit: 200,
      globalHourlyLimit: 1000,
      existingSender: [],
      existingGlobal: [],
    });
    expect(slots[0]?.toISOString()).toBe("2030-01-01T14:00:00.000Z");
    expect(slots[2]?.toISOString()).toBe("2030-01-01T14:00:04.000Z");
  });

  it("assigns strictly increasing times for 1000 leads and never exceeds hourly caps", () => {
    const slots = packSlots({
      now,
      startAt,
      count: 1000,
      delayMs: 2_000,
      senderHourlyLimit: 200,
      globalHourlyLimit: 1000,
      existingSender: [],
      existingGlobal: [],
    });

    expect(slots).toHaveLength(1000);
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i]!.getTime()).toBeGreaterThan(slots[i - 1]!.getTime());
    }

    const perHour = new Map<string, number>();
    for (const slot of slots) {
      const key = hourBucketUtc(slot.getTime());
      perHour.set(key, (perHour.get(key) ?? 0) + 1);
    }
    for (const count of perHour.values()) {
      expect(count).toBeLessThanOrEqual(200);
    }
  });
});
