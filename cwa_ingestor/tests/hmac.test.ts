import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalRequest, sha256Hex, signedHeaders, SIGNATURE_HEADERS } from "../src/hmac.js";

describe("forecast ingestion HMAC", () => {
  it("canonicalizes every required request field", () => {
    const bodySha256 = sha256Hex('{"version":1}');
    expect(canonicalRequest({
      version: "1",
      timestamp: "1788048000",
      nonce: "abc_DEF-123",
      method: "post",
      pathname: "/api/v1/internal/forecast-ingestion/cwa",
      bodySha256,
    })).toBe([
      "1",
      "1788048000",
      "abc_DEF-123",
      "POST",
      "/api/v1/internal/forecast-ingestion/cwa",
      bodySha256,
    ].join("\n"));
  });

  it("signs the raw body and path deterministically", () => {
    const secret = "a".repeat(32);
    const body = '{"version":1}';
    const headers = signedHeaders({
      secret,
      method: "POST",
      pathname: "/api/v1/internal/forecast-ingestion/cwa",
      body,
      now: new Date("2026-08-30T00:00:00Z"),
      nonce: "fixed_nonce_123456",
    });
    const canonical = canonicalRequest({
      version: "1",
      timestamp: headers[SIGNATURE_HEADERS.timestamp]!,
      nonce: headers[SIGNATURE_HEADERS.nonce]!,
      method: "POST",
      pathname: "/api/v1/internal/forecast-ingestion/cwa",
      bodySha256: sha256Hex(body),
    });
    expect(headers[SIGNATURE_HEADERS.signature]).toBe(
      createHmac("sha256", secret).update(canonical).digest("hex"),
    );
    expect(signedHeaders({
      secret,
      method: "POST",
      pathname: "/wrong-path",
      body,
      now: new Date("2026-08-30T00:00:00Z"),
      nonce: "fixed_nonce_123456",
    })[SIGNATURE_HEADERS.signature]).not.toBe(headers[SIGNATURE_HEADERS.signature]);
  });
});
