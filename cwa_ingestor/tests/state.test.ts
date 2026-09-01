import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { StateRepository, emptyState, pendingBatches } from "../src/state.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("persistent state", () => {
  it("atomically restores last-success metadata", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cwa-state-"));
    directories.push(directory);
    const repository = new StateRepository(directory);
    const state = emptyState();
    state.lastAttemptAt = "2026-08-30T00:00:00.000Z";
    state.lastSuccessAt = "2026-08-30T00:01:00.000Z";
    await repository.save(state);
    expect(await repository.load()).toEqual(state);
    expect(JSON.parse(await readFile(join(directory, "state.json"), "utf8"))).toEqual(state);
  });

  it("fails closed without overwriting corrupt state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cwa-state-"));
    directories.push(directory);
    await writeFile(join(directory, "state.json"), "not-json", "utf8");
    await expect(new StateRepository(directory).load()).rejects.toThrow("Persisted runner state is invalid");
    expect(await readFile(join(directory, "state.json"), "utf8")).toBe("not-json");
  });

  it("persists all 95 batches required by 19 spots across 25 forecast leads", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cwa-state-"));
    directories.push(directory);
    const repository = new StateRepository(directory);
    const snapshot = {
      spotId: "spot_wushi-harbor-north",
      provider: "cwa" as const,
      model: "cwa-wave-f-a0020-001" as const,
      issuedAt: "2026-08-30T06:25:15.000Z",
      modelRunAt: "2026-08-30T00:00:00.000Z",
      validAt: "2026-08-30T03:00:00.000Z",
      leadHours: 3,
      gridLatitude: 24.9,
      gridLongitude: 121.9,
      waveHeight: 0.82,
      waveDirection: 96,
      wavePeriod: 7.13,
      tideHeight: 0.2,
      tideSlope: -0.31,
      tideState: "falling" as const,
      provenance: {
        wave: {
          dataset: "F-A0020-001" as const,
          identifiers: { hs: "height-id", t: "period-id", dir: "direction-id" },
        },
        tide: {
          dataset: "F-A0021-001" as const,
          locationId: "10002040" as const,
          datum: "AboveLocalMSL" as const,
          units: "m" as const,
          interpolation: "half-cosine-between-adjacent-extrema" as const,
        },
      },
    };
    const state = emptyState();
    state.pendingBatches = pendingBatches(Array.from({ length: 19 * 25 }, () => snapshot));
    expect(state.pendingBatches).toHaveLength(95);
    await repository.save(state);
    expect((await repository.load()).pendingBatches).toHaveLength(95);
  });
});
