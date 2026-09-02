import { AppError } from "../lib/errors";
import { hourBucketUtc, MS_PER_HOUR, nextHourStartMs } from "../lib/hours";
import { SCHEDULE_HORIZON_HOURS } from "../config/constants";

export type PackSlotsInput = {
  now: Date;
  startAt: Date;
  count: number;
  delayMs: number;
  senderHourlyLimit: number;
  globalHourlyLimit: number;
  existingSender: Date[];
  existingGlobal: Date[];
};

export function packSlots(input: PackSlotsInput): Date[] {
  if (input.count <= 0) return [];
  if (input.delayMs <= 0) {
    throw new AppError(400, "INVALID_DELAY", "Delay between emails must be positive");
  }
  if (input.senderHourlyLimit <= 0 || input.globalHourlyLimit <= 0) {
    throw new AppError(400, "INVALID_HOURLY_LIMIT", "Hourly limits must be positive");
  }

  const senderCounts = new Map<string, number>();
  const globalCounts = new Map<string, number>();

  for (const t of input.existingSender) {
    bump(senderCounts, hourBucketUtc(t.getTime()));
  }
  for (const t of input.existingGlobal) {
    bump(globalCounts, hourBucketUtc(t.getTime()));
  }

  const origin = Math.max(input.startAt.getTime(), input.now.getTime());
  const result: Date[] = [];
  let cursor = origin;
  const horizon = origin + SCHEDULE_HORIZON_HOURS * MS_PER_HOUR;

  for (let i = 0; i < input.count; i++) {
    let t = cursor;
    while (true) {
      if (t > horizon) {
        throw new AppError(
          400,
          "SCHEDULE_HORIZON",
          `Cannot schedule ${input.count} emails within ${SCHEDULE_HORIZON_HOURS} hours given the hourly limits`,
        );
      }
      const bucket = hourBucketUtc(t);
      const senderUsed = senderCounts.get(bucket) ?? 0;
      const globalUsed = globalCounts.get(bucket) ?? 0;
      if (senderUsed < input.senderHourlyLimit && globalUsed < input.globalHourlyLimit) {
        break;
      }
      t = nextHourStartMs(t);
    }

    result.push(new Date(t));
    const bucket = hourBucketUtc(t);
    bump(senderCounts, bucket);
    bump(globalCounts, bucket);
    cursor = t + input.delayMs;
  }

  return result;
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}
