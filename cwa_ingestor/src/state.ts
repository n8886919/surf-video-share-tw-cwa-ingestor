import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  acceptedCwaIngestionBatchSchema,
  cwaIngestionBatchSchema,
  type AcceptedCwaIngestionBatch,
  type CwaIngestionBatch,
} from "./contract.js";

const stateSchema = z.object({
  version: z.literal(1),
  lastAttemptAt: z.string().datetime({ offset: true }).nullable(),
  lastSuccessAt: z.string().datetime({ offset: true }).nullable(),
  lastIssuedAt: z.string().datetime({ offset: true }).nullable(),
  lastModelRunAt: z.string().datetime({ offset: true }).nullable(),
  firstValidAt: z.string().datetime({ offset: true }).nullable(),
  lastValidAt: z.string().datetime({ offset: true }).nullable(),
  pendingBatches: z.array(acceptedCwaIngestionBatchSchema).max(32),
}).strict();

export type RunnerState = z.infer<typeof stateSchema>;

export function emptyState(): RunnerState {
  return {
    version: 1,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastIssuedAt: null,
    lastModelRunAt: null,
    firstValidAt: null,
    lastValidAt: null,
    pendingBatches: [],
  };
}

export class StateRepository {
  private readonly statePath: string;
  private readonly temporaryPath: string;

  constructor(private readonly dataDirectory: string) {
    this.statePath = join(dataDirectory, "state.json");
    this.temporaryPath = join(dataDirectory, ".state.json.tmp");
  }

  async load(): Promise<RunnerState> {
    try {
      return stateSchema.parse(JSON.parse(await readFile(this.statePath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
      throw new Error("Persisted runner state is invalid; restore or move state.json before restart", {
        cause: error,
      });
    }
  }

  async save(state: RunnerState): Promise<void> {
    const validated = stateSchema.parse(state);
    await mkdir(this.dataDirectory, { recursive: true, mode: 0o700 });
    await writeFile(this.temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(this.temporaryPath, this.statePath);
  }
}

export function pendingBatches(snapshots: CwaIngestionBatch["snapshots"]): AcceptedCwaIngestionBatch[] {
  const batches: CwaIngestionBatch[] = [];
  for (let offset = 0; offset < snapshots.length; offset += 5) {
    batches.push(cwaIngestionBatchSchema.parse({
      version: 2,
      snapshots: snapshots.slice(offset, offset + 5),
    }));
  }
  return batches;
}
