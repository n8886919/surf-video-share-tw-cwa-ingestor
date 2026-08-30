import { readFile } from "node:fs/promises";
import { z } from "zod";

const optionsSchema = z.object({
  worker_base_url: z.string().url(),
  cwa_api_key: z.string().min(1).max(500),
  ingestion_secret: z.string().min(32).max(500),
}).strict();

export interface RunnerConfig {
  workerBaseUrl: string;
  cwaApiKey: string;
  ingestionSecret: string;
  dataDirectory: string;
}

export async function loadConfig(
  optionsPath = process.env.OPTIONS_PATH ?? "/data/options.json",
  dataDirectory = process.env.DATA_DIRECTORY ?? "/data",
): Promise<RunnerConfig> {
  const parsed = optionsSchema.parse(JSON.parse(await readFile(optionsPath, "utf8")));
  const workerUrl = new URL(parsed.worker_base_url);
  if (workerUrl.protocol !== "https:") throw new Error("worker_base_url must use HTTPS");
  if (workerUrl.username || workerUrl.password || workerUrl.search || workerUrl.hash) {
    throw new Error("worker_base_url must not contain credentials, query, or fragment");
  }
  if (workerUrl.pathname !== "/" && workerUrl.pathname !== "") {
    throw new Error("worker_base_url must contain only the Worker origin");
  }
  return {
    workerBaseUrl: workerUrl.origin,
    cwaApiKey: parsed.cwa_api_key,
    ingestionSecret: parsed.ingestion_secret,
    dataDirectory,
  };
}
