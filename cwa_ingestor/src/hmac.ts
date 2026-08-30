import { createHash, createHmac, randomBytes } from "node:crypto";
import { SIGNATURE_VERSION } from "./constants.js";

export const SIGNATURE_HEADERS = {
  version: "x-forecast-ingestion-version",
  timestamp: "x-forecast-ingestion-timestamp",
  nonce: "x-forecast-ingestion-nonce",
  signature: "x-forecast-ingestion-signature",
} as const;

export function sha256Hex(body: string | Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

export function canonicalRequest(input: {
  version: string;
  timestamp: string;
  nonce: string;
  method: string;
  pathname: string;
  bodySha256: string;
}): string {
  return [
    input.version,
    input.timestamp,
    input.nonce,
    input.method.toUpperCase(),
    input.pathname,
    input.bodySha256.toLowerCase(),
  ].join("\n");
}

export function signedHeaders(input: {
  secret: string;
  method: string;
  pathname: string;
  body: string;
  now?: Date;
  nonce?: string;
}): Record<string, string> {
  const version = SIGNATURE_VERSION;
  const timestamp = String(Math.floor((input.now ?? new Date()).getTime() / 1_000));
  const nonce = input.nonce ?? randomBytes(18).toString("base64url");
  const bodySha256 = sha256Hex(input.body);
  const canonical = canonicalRequest({
    version,
    timestamp,
    nonce,
    method: input.method,
    pathname: input.pathname,
    bodySha256,
  });
  const signature = createHmac("sha256", input.secret).update(canonical).digest("hex");
  return {
    [SIGNATURE_HEADERS.version]: version,
    [SIGNATURE_HEADERS.timestamp]: timestamp,
    [SIGNATURE_HEADERS.nonce]: nonce,
    [SIGNATURE_HEADERS.signature]: signature,
  };
}
