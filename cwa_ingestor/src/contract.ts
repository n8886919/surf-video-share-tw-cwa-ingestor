import { z } from "zod";
import {
  CWA_MODEL,
  CWA_PROVIDER,
  CWA_TIDE_LOCATION_ID,
  INGESTION_BATCH_SIZE,
} from "./constants.js";

export const CWA_FORECAST_INGESTION_CONTRACT = {
  version: "cwa-forecast-ingestion-v1",
  jsonSchemaSha256: "6316768333f715908074526c113f5ddf01a508d55dae93eb01032867575fac30",
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

const tideProvenanceSchema = z.object({
  dataset: z.literal("F-A0021-001"),
  locationId: z.literal(CWA_TIDE_LOCATION_ID),
  datum: z.literal("AboveLocalMSL"),
  units: z.literal("m"),
  interpolation: z.literal("half-cosine-between-adjacent-extrema"),
}).strict();

export const cwaSnapshotSchema = z.object({
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
  provenance: z.object({
    wave: z.object({
      dataset: z.literal("F-A0020-001"),
      identifiers: waveIdentifiersSchema,
    }).strict(),
    tide: tideProvenanceSchema.nullable(),
  }).strict(),
}).strict().refine(
  (snapshot) => [snapshot.waveHeight, snapshot.waveDirection, snapshot.wavePeriod]
    .some((value) => value !== null),
  { message: "At least one CWA wave metric is required" },
);

export const cwaIngestionBatchSchema = z.object({
  version: z.literal(1),
  snapshots: z.array(cwaSnapshotSchema).min(1).max(INGESTION_BATCH_SIZE),
}).strict();

export const ingestionResultSchema = z.object({
  attempted: z.number().int().nonnegative(),
  inserted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
}).strict();

export type ForecastSpot = z.infer<typeof forecastSpotSchema>;
export type CwaSnapshot = z.infer<typeof cwaSnapshotSchema>;
export type CwaIngestionBatch = z.infer<typeof cwaIngestionBatchSchema>;
export type IngestionResult = z.infer<typeof ingestionResultSchema>;
