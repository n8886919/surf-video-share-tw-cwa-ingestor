import { z } from "zod";
import {
  CWA_MODEL,
  CWA_PROVIDER,
  CWA_TIDE_LOCATION_IDS,
  INGESTION_BATCH_SIZE,
} from "./constants.js";

export const CWA_FORECAST_INGESTION_CONTRACT = {
  version: "cwa-forecast-ingestion-v2",
  jsonSchemaSha256: "24eeaed68e8e358880f43c127dde715af5c36b7af80a5667d58a67481d01c296",
  tideMappingSha256: "217b188f9b366cb50aad2566135c5c04cab60c593d5a553306b33ba25714a5e3",
} as const;

const isoInstantSchema = z.string().datetime({ offset: true });
const longitudeSchema = z.number().finite().min(-180).max(180);
const latitudeSchema = z.number().finite().min(-90).max(90);

export const forecastSpotSchema = z.object({
  id: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
}).strict();

export const forecastSpotsResponseSchema = z.object({
  spots: z.array(forecastSpotSchema).min(1).max(10),
}).strict();

const waveIdentifiersSchema = z.object({
  hs: z.string().min(1).max(200).optional(),
  t: z.string().min(1).max(200).optional(),
  dir: z.string().min(1).max(200).optional(),
}).strict();

const tideProvenanceV1Schema = z.object({
  dataset: z.literal("F-A0021-001"),
  locationId: z.literal("O00400"),
  datum: z.literal("AboveLocalMSL"),
  units: z.literal("m"),
  interpolation: z.literal("half-cosine-between-adjacent-extrema"),
}).strict();

const tideProvenanceSchema = z.object({
  dataset: z.literal("F-A0021-001"),
  locationId: z.enum(CWA_TIDE_LOCATION_IDS),
  datum: z.literal("AboveLocalMSL"),
  units: z.literal("m"),
  interpolation: z.literal("half-cosine-between-adjacent-extrema"),
}).strict();

const cwaSnapshotBaseSchema = z.object({
  spotId: z.string().min(1).max(100),
  provider: z.literal(CWA_PROVIDER),
  model: z.literal(CWA_MODEL),
  issuedAt: isoInstantSchema,
  modelRunAt: isoInstantSchema,
  validAt: isoInstantSchema,
  leadHours: z.number().int().min(0).max(72).refine((value) => value % 3 === 0),
  gridLatitude: latitudeSchema.nullable(),
  gridLongitude: longitudeSchema.nullable(),
  waveHeight: z.number().finite().min(0).max(30).nullable(),
  waveDirection: z.number().finite().min(0).lt(360).nullable(),
  wavePeriod: z.number().finite().min(0).max(60).nullable(),
  tideHeight: z.number().finite().min(-20).max(20).nullable(),
  tideSlope: z.number().finite().min(-10).max(10).nullable(),
  tideState: z.enum(["rising", "falling", "high", "low"]).nullable(),
}).strict();

const waveProvenanceSchema = z.object({
  dataset: z.literal("F-A0020-001"),
  identifiers: waveIdentifiersSchema,
}).strict();

function hasWaveMetric(snapshot: {
  waveHeight: number | null;
  waveDirection: number | null;
  wavePeriod: number | null;
}): boolean {
  return [snapshot.waveHeight, snapshot.waveDirection, snapshot.wavePeriod]
    .some((value) => value !== null);
}

export const cwaV1SnapshotSchema = cwaSnapshotBaseSchema.extend({
  provenance: z.object({
    wave: waveProvenanceSchema,
    tide: tideProvenanceV1Schema.nullable(),
  }).strict(),
}).strict().refine(
  hasWaveMetric,
  { message: "At least one CWA wave metric is required" },
);

export const cwaSnapshotSchema = cwaSnapshotBaseSchema.extend({
  provenance: z.object({
    wave: waveProvenanceSchema,
    tide: tideProvenanceSchema.nullable(),
  }).strict(),
}).strict().refine(
  hasWaveMetric,
  { message: "At least one CWA wave metric is required" },
);

export const cwaV1IngestionBatchSchema = z.object({
  version: z.literal(1),
  snapshots: z.array(cwaV1SnapshotSchema).min(1).max(INGESTION_BATCH_SIZE),
}).strict();

export const cwaIngestionBatchSchema = z.object({
  version: z.literal(2),
  snapshots: z.array(cwaSnapshotSchema).min(1).max(INGESTION_BATCH_SIZE),
}).strict();

export const acceptedCwaIngestionBatchSchema = z.union([
  cwaV1IngestionBatchSchema,
  cwaIngestionBatchSchema,
]);

export const ingestionResultSchema = z.object({
  attempted: z.number().int().nonnegative(),
  inserted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
}).strict();

export type ForecastSpot = z.infer<typeof forecastSpotSchema>;
export type CwaSnapshot = z.infer<typeof cwaSnapshotSchema>;
export type CwaIngestionBatch = z.infer<typeof cwaIngestionBatchSchema>;
export type AcceptedCwaIngestionBatch = z.infer<typeof acceptedCwaIngestionBatchSchema>;
export type IngestionResult = z.infer<typeof ingestionResultSchema>;
