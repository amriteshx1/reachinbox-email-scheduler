export async function waitFor<T>(
  fn: () => Promise<T | false | null | undefined>,
  opts: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const intervalMs = opts.intervalMs ?? 50;
  const start = Date.now();
  let last: unknown;
  while (Date.now() - start < timeoutMs) {
    const value = await fn();
    if (value) return value as T;
    last = value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms${opts.label ? ` (${opts.label})` : ""} last=${String(last)}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
