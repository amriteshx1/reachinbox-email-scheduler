export const MS_PER_HOUR = 3_600_000;

export function hourStartMs(ms: number): number {
  return ms - (ms % MS_PER_HOUR);
}

export function nextHourStartMs(ms: number): number {
  return hourStartMs(ms) + MS_PER_HOUR;
}

export function hourBucketUtc(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}${m}${day}${h}`;
}

export function msUntilNextHour(nowMs: number): number {
  return nextHourStartMs(nowMs) - nowMs;
}
