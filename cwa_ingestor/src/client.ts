import {
  CWA_INGESTION_PATH,
  SPOTS_PATH,
} from "./constants.js";
import {
  acceptedCwaIngestionBatchSchema,
  forecastSpotsResponseSchema,
  ingestionResultSchema,
  type AcceptedCwaIngestionBatch,
  type ForecastSpot,
  type IngestionResult,
} from "./contract.js";
import { signedHeaders } from "./hmac.js";

const MAX_RESPONSE_BYTES = 128 * 1024;

async function boundedResponseText(response: Response): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
    throw new Error("Worker response exceeds the safety limit");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new Error("Worker response exceeds the safety limit");
  return new TextDecoder().decode(bytes);
}

export class ForecastIngestionClient {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async request(pathname: string, method: "GET" | "POST", body = ""): Promise<unknown> {
    const headers = signedHeaders({
      secret: this.secret,
      method,
      pathname,
      body,
    });
    const response = await this.fetchImpl(new URL(pathname, this.baseUrl), {
      method,
      headers: {
        accept: "application/json",
        ...(method === "POST" ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      ...(method === "POST" ? { body } : {}),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await boundedResponseText(response);
    if (!response.ok) {
      let code = "UNKNOWN";
      try {
        const payload = JSON.parse(text) as { error?: unknown };
        if (typeof payload.error === "string" && /^[A-Z0-9_]{1,80}$/u.test(payload.error)) code = payload.error;
      } catch {
        // The status and safe code are sufficient; never include a remote body in logs.
      }
      throw new Error(`Worker request failed with HTTP ${response.status} (${code})`);
    }
    return text ? JSON.parse(text) : {};
  }

  async listSpots(): Promise<ForecastSpot[]> {
    return forecastSpotsResponseSchema.parse(await this.request(SPOTS_PATH, "GET")).spots;
  }

  async ingestCwa(batch: AcceptedCwaIngestionBatch): Promise<IngestionResult> {
    const validated = acceptedCwaIngestionBatchSchema.parse(batch);
    const result = ingestionResultSchema.parse(
      await this.request(CWA_INGESTION_PATH, "POST", JSON.stringify(validated)),
    );
    if (result.attempted !== validated.snapshots.length) {
      throw new Error("Worker returned an inconsistent attempted count");
    }
    return result;
  }
}
