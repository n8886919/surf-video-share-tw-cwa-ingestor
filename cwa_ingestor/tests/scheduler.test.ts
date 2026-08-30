import { describe, expect, it } from "vitest";
import { isSuccessStale, nextUtcSchedule, retryDelayMs } from "../src/scheduler.js";

describe("UTC scheduler", () => {
  it.each([
    ["2026-08-30T00:00:00Z", "2026-08-30T00:20:00.000Z"],
    ["2026-08-30T00:20:00Z", "2026-08-30T06:20:00.000Z"],
    ["2026-08-30T17:59:00Z", "2026-08-30T18:20:00.000Z"],
    ["2026-08-30T18:21:00Z", "2026-08-31T00:20:00.000Z"],
  ])("calculates the next 20 */6 UTC run", (now, expected) => {
    expect(nextUtcSchedule(new Date(now)).toISOString()).toBe(expected);
  });

  it("caps exponential backoff at one hour", () => {
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(60_000);
    expect(retryDelayMs(99)).toBe(3_600_000);
  });

  it("warns after seven hours without success", () => {
    const now = new Date("2026-08-30T08:00:00Z");
    expect(isSuccessStale("2026-08-30T01:00:01Z", now)).toBe(false);
    expect(isSuccessStale("2026-08-30T01:00:00Z", now)).toBe(false);
    expect(isSuccessStale("2026-08-30T00:59:59Z", now)).toBe(true);
    expect(isSuccessStale(null, now)).toBe(true);
  });
});
