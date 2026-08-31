import { ForecastIngestionClient } from "./client.js";
import type { RunnerConfig } from "./config.js";
import { fetchCwaSnapshots } from "./cwa.js";
import { structuredLog, redactMessage } from "./logging.js";
import { delay, isSuccessStale, nextUtcSchedule, retryDelayMs } from "./scheduler.js";
import { pendingBatches, StateRepository, type RunnerState } from "./state.js";

export interface RunResult {
  attempted: number;
  inserted: number;
  duplicates: number;
  resumedPending: boolean;
}

export class CwaRunner {
  private readonly stateRepository: StateRepository;
  private readonly client: ForecastIngestionClient;

  constructor(
    private readonly config: RunnerConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.stateRepository = new StateRepository(config.dataDirectory);
    this.client = new ForecastIngestionClient(config.workerBaseUrl, config.ingestionSecret, fetchImpl);
  }

  async runOnce(now = new Date()): Promise<RunResult> {
    const state = await this.stateRepository.load();
    const resumedPending = state.pendingBatches.length > 0;
    state.lastAttemptAt = now.toISOString();
    await this.stateRepository.save(state);

    if (!resumedPending) {
      const spots = await this.client.listSpots();
      const cwa = await fetchCwaSnapshots(spots, this.config.cwaApiKey, this.fetchImpl);
      state.pendingBatches = pendingBatches(cwa.snapshots);
      state.lastIssuedAt = cwa.diagnostics.issuedAt;
      state.lastModelRunAt = cwa.diagnostics.modelRunAt;
      state.firstValidAt = cwa.diagnostics.firstValidAt;
      state.lastValidAt = cwa.diagnostics.lastValidAt;
      await this.stateRepository.save(state);
      structuredLog("info", "cwa_fetch_complete", {
        spots: spots.length,
        snapshots: cwa.snapshots.length,
        archiveBytes: cwa.diagnostics.archiveBytes,
        forecastFiles: cwa.diagnostics.forecastFiles,
        maxXmlBytes: cwa.diagnostics.maxXmlBytes,
        issuedAt: cwa.diagnostics.issuedAt,
        modelRunAt: cwa.diagnostics.modelRunAt,
        firstValidAt: cwa.diagnostics.firstValidAt,
        lastValidAt: cwa.diagnostics.lastValidAt,
      });
      for (const warning of cwa.warnings) {
        structuredLog("warn", "cwa_fetch_warning", { message: warning });
      }
    }

    const aggregate = { attempted: 0, inserted: 0, duplicates: 0 };
    while (state.pendingBatches.length) {
      const batch = state.pendingBatches[0];
      if (!batch) break;
      const result = await this.client.ingestCwa(batch);
      aggregate.attempted += result.attempted;
      aggregate.inserted += result.inserted;
      aggregate.duplicates += result.duplicates;
      state.pendingBatches.shift();
      await this.stateRepository.save(state);
    }
    state.lastSuccessAt = new Date().toISOString();
    await this.stateRepository.save(state);
    return { ...aggregate, resumedPending };
  }

  async runForever(): Promise<never> {
    let consecutiveFailures = 0;
    let runAt = new Date();
    while (true) {
      const waitMs = Math.max(0, runAt.getTime() - Date.now());
      if (waitMs) await delay(waitMs);
      try {
        structuredLog("info", "cwa_ingestion_started", {
          attempt: consecutiveFailures + 1,
          previousFailures: consecutiveFailures,
        });
        const result = await this.runOnce();
        consecutiveFailures = 0;
        structuredLog("info", "cwa_ingestion_complete", { ...result });
        runAt = nextUtcSchedule(new Date());
      } catch (error) {
        consecutiveFailures += 1;
        const retryMs = retryDelayMs(consecutiveFailures);
        structuredLog("error", "cwa_ingestion_failed", {
          consecutiveFailures,
          retrySeconds: Math.round(retryMs / 1_000),
          message: redactMessage(error, [this.config.cwaApiKey, this.config.ingestionSecret]),
        });
        runAt = new Date(Date.now() + retryMs);
      }

      let state: RunnerState | null = null;
      try {
        state = await this.stateRepository.load();
      } catch (error) {
        structuredLog("error", "state_read_failed", {
          message: redactMessage(error, [this.config.cwaApiKey, this.config.ingestionSecret]),
        });
      }
      if (!state || isSuccessStale(state.lastSuccessAt)) {
        structuredLog("warn", "stale_success", { lastSuccessAt: state?.lastSuccessAt ?? null });
      }
      structuredLog("info", "next_attempt_scheduled", { runAt: runAt.toISOString() });
    }
  }
}
