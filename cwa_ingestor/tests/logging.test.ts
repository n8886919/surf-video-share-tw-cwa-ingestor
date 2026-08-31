import { describe, expect, it } from "vitest";
import { formatLogLine, formatTaipeiTime, redactMessage } from "../src/logging.js";

describe("log redaction", () => {
  it("removes provider keys, ingestion secrets, signatures, and full query strings", () => {
    const key = "cwa-secret-value";
    const secret = "ingestion-secret-value";
    const redacted = redactMessage(
      new Error(`GET https://opendata.cwa.gov.tw/file?Authorization=${key}&format=ZIP Authorization=${key} x-forecast-ingestion-signature=${secret}`),
      [key, secret],
    );
    expect(redacted).not.toContain(key);
    expect(redacted).not.toContain(secret);
    expect(redacted).not.toContain("format=ZIP");
    expect(redacted).toContain("[redacted]");
  });
});

describe("human-readable logs", () => {
  const now = new Date("2026-08-31T16:33:23.822Z");

  it("shows explicit Asia/Taipei time and a readable validation failure", () => {
    const message = JSON.stringify([{
      origin: "array",
      code: "too_big",
      maximum: 10,
      inclusive: true,
      path: ["spots"],
      message: "Too big: expected array to have <=10 items",
    }]);

    expect(formatLogLine("error", "cwa_ingestion_failed", {
      consecutiveFailures: 23,
      retrySeconds: 3_600,
      message,
    }, now)).toBe(
      "[2026-09-01 00:33:23 Asia/Taipei] ERROR CWA ingestion attempt failed [cwa_ingestion_failed] | failures=23 | retry=1h | error=spots has too many items (maximum 10)",
    );
  });

  it("formats standalone timestamps in Taipei time", () => {
    expect(formatTaipeiTime("2026-08-31T16:33:23.822Z"))
      .toBe("2026-09-01 00:33:23 Asia/Taipei");
  });

  it("formats stale success and next attempt times in Taipei time", () => {
    expect(formatLogLine("warn", "stale_success", {
      lastSuccessAt: "2026-08-30T12:20:40.428Z",
    }, now)).toContain(
      "lastSuccessAt=2026-08-30 20:20:40 Asia/Taipei",
    );
    expect(formatLogLine("info", "next_attempt_scheduled", {
      runAt: "2026-08-31T17:33:23.823Z",
    }, now)).toContain(
      "runAt=2026-09-01 01:33:23 Asia/Taipei",
    );
  });
});
