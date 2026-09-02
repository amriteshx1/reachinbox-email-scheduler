import { randomUUID } from "node:crypto";
import { AppError } from "../lib/errors";
import { redis } from "../lib/redis";
import { hourBucketUtc, hourStartMs, MS_PER_HOUR } from "../lib/hours";
import { logger } from "../lib/logger";

const ACQUIRE_PERMIT = `
local permitKey = KEYS[1]
local lastKey = KEYS[2]
local senderRl = KEYS[3]
local globalRl = KEYS[4]
local gapKey = KEYS[5]

if redis.call('EXISTS', permitKey) == 1 then
  return {1, 0, 0}
end

local now = tonumber(ARGV[1])
local minDelay = tonumber(ARGV[2])
local senderLimit = tonumber(ARGV[3])
local globalLimit = tonumber(ARGV[4])

local last = tonumber(redis.call('GET', lastKey) or '0')
if last > 0 and (now - last) < minDelay then
  return {0, minDelay - (now - last), 1}
end

local sc = tonumber(redis.call('GET', senderRl) or '0')
local gc = tonumber(redis.call('GET', globalRl) or '0')
if sc >= senderLimit or gc >= globalLimit then
  return {0, 0, 2}
end

redis.call('SET', lastKey, now, 'PX', tonumber(ARGV[6]))
local nsc = redis.call('INCR', senderRl)
if nsc == 1 then redis.call('PEXPIRE', senderRl, tonumber(ARGV[7])) end
local ngc = redis.call('INCR', globalRl)
if ngc == 1 then redis.call('PEXPIRE', globalRl, tonumber(ARGV[7])) end

local gap = tonumber(redis.call('GET', gapKey) or '0')
if gap > 0 then
  redis.call('DECR', gapKey)
end

redis.call('SET', permitKey, senderRl .. '|' .. globalRl, 'PX', tonumber(ARGV[5]))
return {1, nsc, ngc}
`;

const RELEASE_PERMIT = `
local v = redis.call('GET', KEYS[1])
if not v then
  return 0
end
local sep = string.find(v, '|', 1, true)
if sep then
  local sk = string.sub(v, 1, sep - 1)
  local gk = string.sub(v, sep + 1)
  if tonumber(redis.call('GET', sk) or '0') > 0 then
    redis.call('DECR', sk)
  end
  if tonumber(redis.call('GET', gk) or '0') > 0 then
    redis.call('DECR', gk)
  end
end
redis.call('DEL', KEYS[1])
return 1
`;

const RESERVE_NEXT_SLOT = `
local now = tonumber(ARGV[1])
local delayMs = tonumber(ARGV[2])
local senderLimit = tonumber(ARGV[3])
local globalLimit = tonumber(ARGV[4])
local senderId = ARGV[5]
local ttl = tonumber(ARGV[6])
local hours = tonumber(ARGV[7])

for i = 0, hours - 1 do
  local hourMs = tonumber(ARGV[8 + i * 2])
  local b = ARGV[9 + i * 2]
  local sk = 'rl:s:' .. senderId .. ':' .. b
  local gk = 'rl:g:' .. b
  local gapKey = 'gap:s:' .. senderId .. ':' .. b
  local sc = tonumber(redis.call('GET', sk) or '0')
  local gc = tonumber(redis.call('GET', gk) or '0')
  local gap = tonumber(redis.call('GET', gapKey) or '0')
  if (sc + gap) < senderLimit and (gc + gap) < globalLimit then
    local n = redis.call('INCR', gapKey)
    if n == 1 then redis.call('PEXPIRE', gapKey, ttl) end
    local t = hourMs + (n - 1) * delayMs
    local hourEnd = hourMs + 3600000
    if t < hourEnd then
      if t < now then t = hourMs end
      return {t, b, n}
    end
    redis.call('DECR', gapKey)
  end
end

return {0, '', 0}
`;

const UNLOCK = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export type AcquireResult =
  | { ok: true; senderCount: number; globalCount: number }
  | { ok: false; reason: "min-delay"; waitMs: number }
  | { ok: false; reason: "hourly"; waitMs: number };

function permitKey(emailId: string): string {
  return `permit:${emailId}`;
}

function lastSendKey(senderId: string): string {
  return `lastsend:${senderId}`;
}

function senderRlKey(senderId: string, hourBucket: string): string {
  return `rl:s:${senderId}:${hourBucket}`;
}

function globalRlKey(hourBucket: string): string {
  return `rl:g:${hourBucket}`;
}

function gapKey(senderId: string, hourBucket: string): string {
  return `gap:s:${senderId}:${hourBucket}`;
}

function asNums(result: unknown): number[] {
  if (!Array.isArray(result)) return [0, 0, 0];
  return result.map((v) => Number(v));
}

export async function tryAcquireSendPermit(input: {
  emailId: string;
  senderId: string;
  nowMs: number;
  minDelayMs: number;
  senderLimit: number;
  globalLimit: number;
}): Promise<AcquireResult> {
  const bucket = hourBucketUtc(input.nowMs);
  const result = asNums(
    await redis.eval(
      ACQUIRE_PERMIT,
      5,
      permitKey(input.emailId),
      lastSendKey(input.senderId),
      senderRlKey(input.senderId, bucket),
      globalRlKey(bucket),
      gapKey(input.senderId, bucket),
      String(input.nowMs),
      String(input.minDelayMs),
      String(input.senderLimit),
      String(input.globalLimit),
      String(3 * MS_PER_HOUR),
      String(Math.max(input.minDelayMs * 3, 60_000)),
      String(3 * MS_PER_HOUR),
    ),
  );

  const status = result[0] ?? 0;
  if (status === 1) {
    return { ok: true, senderCount: result[1] ?? 0, globalCount: result[2] ?? 0 };
  }
  const kind = result[2] ?? 1;
  if (kind === 1) {
    return { ok: false, reason: "min-delay", waitMs: Math.max(1, result[1] ?? input.minDelayMs) };
  }
  const waitMs = hourStartMs(input.nowMs) + MS_PER_HOUR - input.nowMs;
  return { ok: false, reason: "hourly", waitMs: Math.max(1, waitMs) };
}

export async function releaseSendPermit(emailId: string): Promise<void> {
  await redis.eval(RELEASE_PERMIT, 1, permitKey(emailId));
}

export async function reserveNextSlot(input: {
  senderId: string;
  nowMs: number;
  delayMs: number;
  senderLimit: number;
  globalLimit: number;
}): Promise<{ scheduledAtMs: number; hourBucket: string; offset: number }> {
  const hours = 48;
  const nextHour = hourStartMs(input.nowMs) + MS_PER_HOUR;
  const hourArgs: string[] = [];
  for (let i = 0; i < hours; i++) {
    const hourMs = nextHour + i * MS_PER_HOUR;
    hourArgs.push(String(hourMs), hourBucketUtc(hourMs));
  }

  const result = await redis.eval(
    RESERVE_NEXT_SLOT,
    0,
    String(input.nowMs),
    String(input.delayMs),
    String(input.senderLimit),
    String(input.globalLimit),
    input.senderId,
    String(3 * MS_PER_HOUR),
    String(hours),
    ...hourArgs,
  );

  const arr = Array.isArray(result) ? result : [0, "", 0];
  const scheduledAtMs = Number(arr[0]);
  if (!scheduledAtMs) {
    logger.error({ senderId: input.senderId }, "failed to reserve next hourly slot within 48h");
    throw new Error("No hourly capacity within 48 hours");
  }
  return {
    scheduledAtMs,
    hourBucket: String(arr[1]),
    offset: Number(arr[2]),
  };
}

export async function withSenderLock<T>(senderId: string, fn: () => Promise<T>): Promise<T> {
  const key = `lock:alloc:${senderId}`;
  const token = randomUUID();
  let acquired = (await redis.set(key, token, "PX", 20_000, "NX")) === "OK";
  if (!acquired) {
    for (let i = 0; i < 25 && !acquired; i++) {
      await sleep(40 + i * 20);
      acquired = (await redis.set(key, token, "PX", 20_000, "NX")) === "OK";
    }
  }
  if (!acquired) {
    throw new AppError(409, "SENDER_BUSY", "Sender is busy scheduling, retry shortly");
  }
  try {
    return await fn();
  } finally {
    await redis.eval(UNLOCK, 1, key, token);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
