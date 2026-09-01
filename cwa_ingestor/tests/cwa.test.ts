import { describe, expect, it } from "vitest";
import {
  buildCwaSnapshots,
  fetchCwaSnapshots,
  interpolateCwaTide,
  parseCwaTidePayload,
  parseCwaWaveArchive,
} from "../src/cwa.js";
import { CWA_TIDE_LOCATION_BY_SPOT_ID, CWA_TIDE_LOCATION_IDS } from "../src/constants.js";
import { currentCwaWaveFixture, cwaWaveFixture, testSpot, tideFixture } from "./fixtures.js";

describe("CWA parser", () => {
  it("retains only three-hourly 0–72 leads and nearest grids", () => {
    const parsed = parseCwaWaveArchive(cwaWaveFixture(), [testSpot]);
    expect(parsed.forecastFiles).toBe(3);
    expect(parsed.points).toHaveLength(1);
    expect(parsed.points[0]).toMatchObject({
      leadHours: 3,
      waveHeight: 0.82,
      wavePeriod: 7.13,
      waveDirection: 96,
      gridLatitude: 24.87,
      gridLongitude: 121.84,
    });
  });

  it("preserves tide interpolation and both official provenance datasets", () => {
    const points = parseCwaWaveArchive(cwaWaveFixture(), [testSpot]).points;
    const tides = parseCwaTidePayload(tideFixture());
    expect(interpolateCwaTide(tides.get("10002040") ?? [], "2026-08-25T03:00:00.000Z")).toEqual({
      heightMeters: 0.7,
      slopeMetersPerHour: 0.2618,
      state: "rising",
    });
    expect(buildCwaSnapshots(points, tides)[0]).toMatchObject({
      provider: "cwa",
      model: "cwa-wave-f-a0020-001",
      provenance: {
        wave: { dataset: "F-A0020-001" },
        tide: { dataset: "F-A0021-001", locationId: "10002040" },
      },
    });
  });

  it("uses the approved tide location independently for every active spot", () => {
    const basePoint = parseCwaWaveArchive(cwaWaveFixture(), [testSpot]).points[0]!;
    const points = Object.entries(CWA_TIDE_LOCATION_BY_SPOT_ID).map(([spotId]) => ({
      ...basePoint,
      spot: { ...basePoint.spot, id: spotId },
    }));
    const snapshots = buildCwaSnapshots(points, parseCwaTidePayload(tideFixture()));
    expect(snapshots).toHaveLength(19);
    expect(snapshots.map((snapshot) => [snapshot.spotId, snapshot.provenance.tide?.locationId]))
      .toEqual(Object.entries(CWA_TIDE_LOCATION_BY_SPOT_ID));
    expect(snapshots.every((snapshot) => snapshot.tideHeight === 0.7)).toBe(true);
  });

  it("supports the current PascalCase CWA XML schema", () => {
    const parsed = parseCwaWaveArchive(currentCwaWaveFixture(), [testSpot]);
    expect(parsed.forecastFiles).toBe(3);
    expect(parsed.points).toHaveLength(1);
    expect(parsed.points[0]).toMatchObject({
      issuedAt: "2026-08-25T06:58:36.000Z",
      modelRunAt: "2026-08-25T00:00:00.000Z",
      validAt: "2026-08-25T03:00:00.000Z",
      waveHeight: 1.7,
      wavePeriod: 9.9,
      waveDirection: 122,
    });
  });

  it("streams the ZIP and reports bounded diagnostics", async () => {
    const archive = cwaWaveFixture();
    let tideRequest: Request | null = null;
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url);
      if (url.pathname.includes("F-A0021-001")) tideRequest = request;
      return url.pathname.includes("F-A0020-001")
        ? new Response(Uint8Array.from(archive).buffer, { headers: { "content-type": "application/zip" } })
        : Response.json(tideFixture());
    };
    const result = await fetchCwaSnapshots([testSpot], "test-key", fetchImpl as typeof fetch);
    expect(result.snapshots).toHaveLength(1);
    expect(result.diagnostics).toMatchObject({ archiveBytes: archive.byteLength, forecastFiles: 3 });
    expect(result.warnings).toEqual([]);
    expect(new URL(tideRequest!.url).searchParams.get("Authorization")).toBeNull();
    expect(new URL(tideRequest!.url).searchParams.get("LocationId")).toBe(CWA_TIDE_LOCATION_IDS.join(","));
    expect(tideRequest!.headers.get("Authorization")).toBe("test-key");
  });

  it("rejects a declared oversized archive before parsing", async () => {
    const fetchImpl = async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input);
      return url.pathname.includes("F-A0020-001")
        ? new Response(new Uint8Array(), { headers: { "content-length": String(97 * 1024 * 1024) } })
        : Response.json(tideFixture());
    };
    await expect(fetchCwaSnapshots([testSpot], "test-key", fetchImpl as typeof fetch))
      .rejects.toThrow("download safety limit");
  });
});
