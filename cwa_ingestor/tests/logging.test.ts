import { describe, expect, it } from "vitest";
import { redactMessage } from "../src/logging.js";

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
