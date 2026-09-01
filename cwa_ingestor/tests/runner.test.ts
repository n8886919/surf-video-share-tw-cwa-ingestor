import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CwaRunner } from "../src/runner.js";
import { StateRepository } from "../src/state.js";
import { cwaWaveFixture, testSpot, tideFixture } from "./fixtures.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("runner recovery", () => {
  it("persists normalized batches and retries them without downloading the ZIP again", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cwa-runner-"));
    directories.push(directory);
    const archive = cwaWaveFixture();
    let waveFetches = 0;
    let ingestionPosts = 0;
    const submittedContracts: Array<{ version: number; tideLocationId: string | null }> = [];
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url);
      if (url.pathname.endsWith("/forecast-ingestion/spots")) {
        return Response.json({ spots: [testSpot] });
      }
      if (url.pathname.includes("F-A0020-001")) {
        waveFetches += 1;
        return new Response(Uint8Array.from(archive).buffer, { headers: { "content-type": "application/zip" } });
      }
      if (url.pathname.includes("F-A0021-001")) return Response.json(tideFixture());
      if (url.pathname.endsWith("/forecast-ingestion/cwa")) {
        ingestionPosts += 1;
        const body = JSON.parse(await request.text()) as {
          version: number;
          snapshots: Array<{ provenance: { tide: { locationId: string } | null } }>;
        };
        submittedContracts.push({
          version: body.version,
          tideLocationId: body.snapshots[0]?.provenance.tide?.locationId ?? null,
        });
        if (ingestionPosts === 1) {
          return Response.json({ error: "TEMPORARY" }, { status: 503 });
        }
        return Response.json({ attempted: body.snapshots.length, inserted: body.snapshots.length, duplicates: 0 });
      }
      throw new Error(`unexpected test path ${url.pathname}`);
    };
    const runner = new CwaRunner({
      workerBaseUrl: "https://worker.example",
      cwaApiKey: "cwa-test-key",
      ingestionSecret: "i".repeat(32),
      dataDirectory: directory,
    }, fetchImpl as typeof fetch);

    await expect(runner.runOnce(new Date("2026-08-30T00:00:00Z"))).rejects.toThrow("HTTP 503");
    expect((await new StateRepository(directory).load()).pendingBatches).toHaveLength(1);

    const result = await runner.runOnce(new Date("2026-08-30T00:01:00Z"));
    expect(result).toEqual({ attempted: 1, inserted: 1, duplicates: 0, resumedPending: true });
    expect(waveFetches).toBe(1);
    expect(submittedContracts).toEqual([
      { version: 4, tideLocationId: "10002040" },
      { version: 4, tideLocationId: "10002040" },
    ]);
    const restored = await new StateRepository(directory).load();
    expect(restored.pendingBatches).toEqual([]);
    expect(restored.lastSuccessAt).not.toBeNull();
  });
});
