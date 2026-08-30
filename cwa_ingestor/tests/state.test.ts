import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { StateRepository, emptyState } from "../src/state.js";

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
});
