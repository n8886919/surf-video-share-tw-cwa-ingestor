import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CWA_FORECAST_INGESTION_CONTRACT,
  acceptedCwaIngestionBatchSchema,
  cwaIngestionBatchSchema,
  cwaV2IngestionBatchSchema,
} from "../src/contract.js";
import { CWA_TIDE_LOCATION_BY_SPOT_ID } from "../src/constants.js";

function snapshot() {
  return {
    spotId: "spot_wushi-harbor-north",
    provider: "cwa" as const,
    model: "cwa-wave-f-a0020-001" as const,
    issuedAt: "2026-08-30T00:20:00.000Z",
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
}

describe("Worker CWA ingestion contract parity", () => {
  it("pins the complete v3 structural contract and tide mapping fingerprints", () => {
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(z.toJSONSchema(cwaIngestionBatchSchema)))
      .digest("hex");
    const tideMappingFingerprint = createHash("sha256")
      .update(JSON.stringify(CWA_TIDE_LOCATION_BY_SPOT_ID))
      .digest("hex");
    expect(CWA_FORECAST_INGESTION_CONTRACT).toEqual({
      version: "cwa-forecast-ingestion-v3",
      jsonSchemaSha256: fingerprint,
      tideMappingSha256: tideMappingFingerprint,
    });
  });

  it("pins refinements that JSON Schema cannot represent", () => {
    expect(cwaIngestionBatchSchema.safeParse({ version: 3, snapshots: [snapshot()] }).success).toBe(true);
    expect(cwaIngestionBatchSchema.safeParse({
      version: 3,
      snapshots: [{ ...snapshot(), leadHours: 4 }],
    }).success).toBe(false);
    expect(cwaIngestionBatchSchema.safeParse({
      version: 3,
      snapshots: [{ ...snapshot(), waveHeight: null, waveDirection: null, wavePeriod: null }],
    }).success).toBe(false);
  });

  it("keeps persisted v1 batches valid until they are retried", () => {
    const legacy = snapshot();
    expect(acceptedCwaIngestionBatchSchema.safeParse({
      version: 1,
      snapshots: [{
        ...legacy,
        provenance: {
          ...legacy.provenance,
          tide: { ...legacy.provenance.tide, locationId: "O00400" },
        },
      }],
    }).success).toBe(true);
  });

  it("keeps persisted v2 batches valid until they are retried", () => {
    const legacy = snapshot();
    expect(cwaV2IngestionBatchSchema.safeParse({
      version: 2,
      snapshots: [{
        ...legacy,
        provenance: {
          ...legacy.provenance,
          tide: { ...legacy.provenance.tide, locationId: "O00400" },
        },
      }],
    }).success).toBe(true);
  });
});
