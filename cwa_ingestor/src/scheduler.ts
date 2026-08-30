export const STALE_SUCCESS_MS = 7 * 60 * 60 * 1_000;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 60 * 60 * 1_000;

export function nextUtcSchedule(now: Date): Date {
  const next = new Date(now);
  next.setUTCSeconds(0, 0);
  const currentHour = next.getUTCHours();
  const candidateHours = [0, 6, 12, 18];
  for (const hour of candidateHours) {
    next.setUTCHours(hour, 20, 0, 0);
    if (next.getTime() > now.getTime()) return new Date(next);
  }
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(0, 20, 0, 0);
  return next;
}

export function retryDelayMs(consecutiveFailures: number): number {
  const exponent = Math.max(0, Math.min(20, consecutiveFailures - 1));
  return Math.min(RETRY_BASE_MS * 2 ** exponent, RETRY_MAX_MS);
}

export function isSuccessStale(lastSuccessAt: string | null, now = new Date()): boolean {
  if (!lastSuccessAt) return true;
  return now.getTime() - new Date(lastSuccessAt).getTime() > STALE_SUCCESS_MS;
}

export async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
