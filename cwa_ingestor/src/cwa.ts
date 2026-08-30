import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate";
import { z } from "zod";
import {
  CWA_MODEL,
  CWA_PROVIDER,
  CWA_TIDE_LOCATION_BY_SPOT_ID,
  CWA_TIDE_LOCATION_IDS,
  CWA_TIDE_URL,
  CWA_WAVE_URL,
  MAX_ARCHIVE_BYTES,
  MAX_FORECAST_FILES,
  MAX_XML_BYTES,
} from "./constants.js";
import { cwaSnapshotSchema, type CwaSnapshot, type ForecastSpot } from "./contract.js";
import { redactMessage } from "./logging.js";

type CwaWaveElement = "hs" | "t" | "dir";

interface CwaGridValue {
  latitude: number;
  longitude: number;
  value: number;
  measures: string;
}

interface ParsedCwaWaveFile {
  element: CwaWaveElement;
  identifier: string;
  sentAt: string;
  modelRunAt: string;
  validAt: string;
  leadHours: number;
  spotValues: Map<string, CwaGridValue>;
}

export interface CwaWavePoint {
  spot: ForecastSpot;
  issuedAt: string;
  modelRunAt: string;
  validAt: string;
  leadHours: number;
  gridLatitude: number | null;
  gridLongitude: number | null;
  waveHeight: number | null;
  waveDirection: number | null;
  wavePeriod: number | null;
  sourceIdentifiers: Partial<Record<CwaWaveElement, string>>;
}

interface CwaRunGroup {
  issuedAt: string;
  modelRunAt: string;
  validAt: string;
  leadHours: number;
  identifiers: Partial<Record<CwaWaveElement, string>>;
  values: Map<string, Partial<Record<CwaWaveElement, CwaGridValue>>>;
}

export interface CwaTideEvent {
  locationId: typeof CWA_TIDE_LOCATION_IDS[number];
  validAt: string;
  heightMeters: number;
  state: "high" | "low";
  latitude: number;
  longitude: number;
}

export interface InterpolatedTide {
  heightMeters: number;
  slopeMetersPerHour: number;
  state: "rising" | "falling" | "high" | "low";
}

export interface CwaDiagnostics {
  archiveBytes: number;
  forecastFiles: number;
  maxXmlBytes: number;
  issuedAt: string | null;
  modelRunAt: string | null;
  firstValidAt: string | null;
  lastValidAt: string | null;
}

export interface CwaFetchResult {
  snapshots: CwaSnapshot[];
  diagnostics: CwaDiagnostics;
  warnings: string[];
}

const tideResponseSchema = z.object({
  records: z.object({
    TideForecasts: z.array(z.object({
      Location: z.object({
        LocationId: z.string(),
        Latitude: z.union([z.number(), z.string()]),
        Longitude: z.union([z.number(), z.string()]),
        TimePeriods: z.object({
          Daily: z.array(z.object({
            Time: z.array(z.object({
              DateTime: z.string(),
              Tide: z.string(),
              TideHeights: z.object({
                AboveLocalMSL: z.union([z.number(), z.string()]),
              }),
            })),
          })),
        }),
      }),
    })),
  }),
}).passthrough();

function tagText(xml: string, tag: string): string | null {
  return new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml)?.[1]?.trim() ?? null;
}

function isoInstant(value: string, label: string): string {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) throw new Error(`CWA returned an invalid ${label}`);
  return instant.toISOString();
}

function concatBytes(chunks: Uint8Array[], total: number): Uint8Array {
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

function measurementValue(
  rawValue: string,
  measures: string,
  element: CwaWaveElement,
  encodedHundredths: boolean,
): number | null {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  const normalizedMeasures = measures.trim().toLowerCase();
  if (element === "hs" && ["0.01m", "m"].includes(normalizedMeasures)) {
    return encodedHundredths ? numeric / 100 : numeric;
  }
  if (element === "t" && ["0.01s", "s"].includes(normalizedMeasures)) {
    return encodedHundredths ? numeric / 100 : numeric;
  }
  if (element === "dir" && ["1degr.", "1degree", "degree"].includes(normalizedMeasures)) {
    return numeric % 360;
  }
  throw new Error(`Unsupported CWA wave measure ${measures} for ${element}`);
}

function gridDistanceSquared(spot: ForecastSpot, latitude: number, longitude: number): number {
  const latitudeDelta = latitude - spot.latitude;
  const longitudeDelta = (longitude - spot.longitude) * Math.cos(spot.latitude * Math.PI / 180);
  return latitudeDelta ** 2 + longitudeDelta ** 2;
}

export function parseCwaWaveXml(
  xml: string,
  filename: string,
  spots: ForecastSpot[],
): ParsedCwaWaveFile {
  const filenameMatch = /(?:^|\/)(\d{8})-(hs|t|dir)\.(\d{3})\.xml$/u.exec(filename);
  if (!filenameMatch) throw new Error(`Unexpected CWA wave filename: ${filename}`);
  const element = filenameMatch[2] as CwaWaveElement;
  const leadHours = Number(filenameMatch[3]);
  const currentSchema = xml.includes("<cwaopendata");
  const identifier = tagText(xml, currentSchema ? "Identifier" : "identifier");
  const sent = tagText(xml, currentSchema ? "Sent" : "sent");
  const dataTime = tagText(xml, currentSchema ? "DateTime" : "dataTime");
  if (!identifier || !sent || !dataTime) throw new Error(`CWA wave XML metadata is incomplete: ${filename}`);

  const validAt = isoInstant(dataTime, "wave valid time");
  const sentAt = isoInstant(sent, "wave issue time");
  const modelRunAt = new Date(new Date(validAt).getTime() - leadHours * 3_600_000).toISOString();
  const nearest = new Map(spots.map((spot) => [spot.id, {
    distance: Number.POSITIVE_INFINITY,
    value: null as CwaGridValue | null,
  }]));
  const currentValueTag = element === "hs"
    ? "WaveHeight"
    : element === "t"
      ? "WavePeriod"
      : "WaveDirection";
  const currentMeasures = currentSchema ? tagText(xml, "Measures") : null;
  const locationPattern = currentSchema
    ? new RegExp(`<Location>\\s*<Latitude>([^<]+)</Latitude>\\s*<Longitude>([^<]+)</Longitude>\\s*<${currentValueTag}>([^<]+)</${currentValueTag}>[\\s\\S]*?</Location>`, "gu")
    : /<location>\s*<lat>([^<]+)<\/lat>\s*<lon>([^<]+)<\/lon>[\s\S]*?<elementValue>\s*<value>([^<]+)<\/value>\s*<measures>([^<]+)<\/measures>[\s\S]*?<\/location>/gu;
  let match: RegExpExecArray | null;
  while ((match = locationPattern.exec(xml)) !== null) {
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const measures = currentSchema ? currentMeasures : match[4];
    if (!measures || match[3] === undefined) throw new Error(`CWA wave XML omitted measures: ${filename}`);
    const value = measurementValue(match[3], measures, element, !currentSchema);
    if (value === null) continue;
    for (const spot of spots) {
      const candidateDistance = gridDistanceSquared(spot, latitude, longitude);
      const current = nearest.get(spot.id);
      if (current && candidateDistance < current.distance) {
        current.distance = candidateDistance;
        current.value = { latitude, longitude, value, measures };
      }
    }
  }

  const spotValues = new Map<string, CwaGridValue>();
  for (const spot of spots) {
    const selected = nearest.get(spot.id)?.value;
    if (selected) spotValues.set(spot.id, selected);
  }
  if (!spotValues.size) throw new Error(`CWA wave XML has no usable sea grid: ${filename}`);
  return { element, identifier, sentAt, modelRunAt, validAt, leadHours, spotValues };
}

function createCwaWaveArchiveParser(spots: ForecastSpot[]) {
  const groups = new Map<string, CwaRunGroup>();
  let archiveError: Error | null = null;
  let processedFiles = 0;
  let maxXmlBytes = 0;
  const unzipper = new Unzip((file) => {
    if (archiveError) return;
    const match = /(?:^|\/)(\d{8})-(hs|t|dir)\.(\d{3})\.xml$/u.exec(file.name);
    const leadHours = Number(match?.[3]);
    if (!match || leadHours > 72 || leadHours % 3 !== 0) return;
    processedFiles += 1;
    if (processedFiles > MAX_FORECAST_FILES || (file.originalSize && file.originalSize > MAX_XML_BYTES)) {
      archiveError = new Error("CWA wave archive exceeds the extraction safety limit");
      return;
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    file.ondata = (error, data, final) => {
      if (archiveError) return;
      if (error) {
        archiveError = error instanceof Error ? error : new Error(String(error));
        return;
      }
      total += data.length;
      maxXmlBytes = Math.max(maxXmlBytes, total);
      if (total > MAX_XML_BYTES) {
        archiveError = new Error(`CWA wave XML exceeds the safety limit: ${file.name}`);
        file.terminate();
        return;
      }
      chunks.push(data);
      if (!final) return;
      try {
        const xml = new TextDecoder().decode(concatBytes(chunks, total));
        const parsed = parseCwaWaveXml(xml, file.name, spots);
        const key = `${parsed.modelRunAt}\u001f${parsed.validAt}`;
        const group: CwaRunGroup = groups.get(key) ?? {
          issuedAt: parsed.sentAt,
          modelRunAt: parsed.modelRunAt,
          validAt: parsed.validAt,
          leadHours: parsed.leadHours,
          identifiers: {},
          values: new Map(),
        };
        if (parsed.sentAt > group.issuedAt) group.issuedAt = parsed.sentAt;
        group.identifiers[parsed.element] = parsed.identifier;
        for (const [spotId, value] of parsed.spotValues) {
          const spotValues = group.values.get(spotId) ?? {};
          spotValues[parsed.element] = value;
          group.values.set(spotId, spotValues);
        }
        groups.set(key, group);
      } catch (error) {
        archiveError = error instanceof Error ? error : new Error(String(error));
      }
    };
    file.start();
  });
  unzipper.register(UnzipPassThrough);
  unzipper.register(UnzipInflate);
  return {
    push(chunk: Uint8Array, final: boolean) {
      unzipper.push(chunk, final);
      if (archiveError) throw archiveError;
    },
    finish(): { points: CwaWavePoint[]; forecastFiles: number; maxXmlBytes: number } {
      if (archiveError) throw archiveError;
      if (!processedFiles || !groups.size) {
        throw new Error("CWA wave archive contains no three-hourly 0–72 hour XML files");
      }
      const spotById = new Map(spots.map((spot) => [spot.id, spot]));
      const points = Array.from(groups.values())
        .sort((a, b) => a.validAt.localeCompare(b.validAt))
        .flatMap((group) => Array.from(group.values.entries()).flatMap(([spotId, values]) => {
          const spot = spotById.get(spotId);
          if (!spot) return [];
          const grid = values.hs ?? values.t ?? values.dir;
          return [{
            spot,
            issuedAt: group.issuedAt,
            modelRunAt: group.modelRunAt,
            validAt: group.validAt,
            leadHours: group.leadHours,
            gridLatitude: grid?.latitude ?? null,
            gridLongitude: grid?.longitude ?? null,
            waveHeight: values.hs?.value ?? null,
            waveDirection: values.dir?.value ?? null,
            wavePeriod: values.t?.value ?? null,
            sourceIdentifiers: group.identifiers,
          } satisfies CwaWavePoint];
        }));
      return { points, forecastFiles: processedFiles, maxXmlBytes };
    },
  };
}

export function parseCwaWaveArchive(
  archive: Uint8Array,
  spots: ForecastSpot[],
): { points: CwaWavePoint[]; forecastFiles: number; maxXmlBytes: number } {
  if (archive.byteLength > MAX_ARCHIVE_BYTES) throw new Error("CWA wave archive exceeds the safety limit");
  const parser = createCwaWaveArchiveParser(spots);
  parser.push(archive, true);
  return parser.finish();
}

export function parseCwaTidePayload(payload: unknown): Map<string, CwaTideEvent[]> {
  const response = tideResponseSchema.parse(payload);
  const expectedIds = new Set<string>(CWA_TIDE_LOCATION_IDS);
  return new Map(response.records.TideForecasts.flatMap((forecast) => {
    const location = forecast.Location;
    if (!expectedIds.has(location.LocationId)) return [];
    const locationId = location.LocationId as typeof CWA_TIDE_LOCATION_IDS[number];
    const latitude = Number(location.Latitude);
    const longitude = Number(location.Longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    const events = location.TimePeriods.Daily.flatMap((daily) => daily.Time.flatMap((time) => {
      const state = time.Tide === "\u6eff\u6f6e" ? "high" : time.Tide === "\u4e7e\u6f6e" ? "low" : null;
      const heightCentimeters = Number(time.TideHeights.AboveLocalMSL);
      if (!state || !Number.isFinite(heightCentimeters)) return [];
      return [{
        locationId,
        validAt: isoInstant(time.DateTime, "tide valid time"),
        heightMeters: heightCentimeters / 100,
        state,
        latitude,
        longitude,
      } satisfies CwaTideEvent];
    }));
    const unique = new Map(events.map((event) => [event.validAt, event]));
    const sorted = Array.from(unique.values()).sort((a, b) => a.validAt.localeCompare(b.validAt));
    return sorted.length ? [[locationId, sorted] as const] : [];
  }));
}

export function interpolateCwaTide(events: CwaTideEvent[], validAt: string): InterpolatedTide | null {
  const targetMs = new Date(validAt).getTime();
  if (!Number.isFinite(targetMs)) return null;
  const exact = events.find((event) => new Date(event.validAt).getTime() === targetMs);
  if (exact) return { heightMeters: exact.heightMeters, slopeMetersPerHour: 0, state: exact.state };

  const nextIndex = events.findIndex((event) => new Date(event.validAt).getTime() > targetMs);
  if (nextIndex <= 0) return null;
  const previous = events[nextIndex - 1];
  const next = events[nextIndex];
  if (!previous || !next) return null;
  const previousMs = new Date(previous.validAt).getTime();
  const nextMs = new Date(next.validAt).getTime();
  const durationHours = (nextMs - previousMs) / 3_600_000;
  if (durationHours <= 0) return null;
  const progress = (targetMs - previousMs) / (nextMs - previousMs);
  const easing = (1 - Math.cos(Math.PI * progress)) / 2;
  const delta = next.heightMeters - previous.heightMeters;
  const heightMeters = previous.heightMeters + delta * easing;
  const slopeMetersPerHour = delta * Math.PI * Math.sin(Math.PI * progress) / (2 * durationHours);
  return {
    heightMeters: Number(heightMeters.toFixed(4)),
    slopeMetersPerHour: Number(slopeMetersPerHour.toFixed(4)),
    state: delta >= 0 ? "rising" : "falling",
  };
}

export function buildCwaSnapshots(
  wavePoints: CwaWavePoint[],
  tideEventsByLocation: Map<string, CwaTideEvent[]>,
): CwaSnapshot[] {
  return wavePoints.map((point) => {
    const locationId = CWA_TIDE_LOCATION_BY_SPOT_ID[
      point.spot.id as keyof typeof CWA_TIDE_LOCATION_BY_SPOT_ID
    ];
    const tideEvents = locationId ? tideEventsByLocation.get(locationId) ?? [] : [];
    const tide = interpolateCwaTide(tideEvents, point.validAt);
    return cwaSnapshotSchema.parse({
      spotId: point.spot.id,
      provider: CWA_PROVIDER,
      model: CWA_MODEL,
      issuedAt: point.issuedAt,
      modelRunAt: point.modelRunAt,
      validAt: point.validAt,
      leadHours: point.leadHours,
      gridLatitude: point.gridLatitude,
      gridLongitude: point.gridLongitude,
      waveHeight: point.waveHeight,
      waveDirection: point.waveDirection,
      wavePeriod: point.wavePeriod,
      tideHeight: tide?.heightMeters ?? null,
      tideSlope: tide?.slopeMetersPerHour ?? null,
      tideState: tide?.state ?? null,
      provenance: {
        wave: { dataset: "F-A0020-001", identifiers: point.sourceIdentifiers },
        tide: tide && locationId ? {
          dataset: "F-A0021-001",
          locationId,
          datum: "AboveLocalMSL",
          units: "m",
          interpolation: "half-cosine-between-adjacent-extrema",
        } : null,
      },
    });
  });
}

async function fetchCwaTideEvents(
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<Map<string, CwaTideEvent[]>> {
  const url = new URL(CWA_TIDE_URL);
  url.searchParams.set("format", "JSON");
  url.searchParams.set("LocationId", CWA_TIDE_LOCATION_IDS.join(","));
  const response = await fetchImpl(url, {
    headers: { accept: "application/json", Authorization: apiKey },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`CWA tide returned HTTP ${response.status}`);
  return parseCwaTidePayload(await response.json());
}

async function parseCwaWaveResponse(
  response: Response,
  spots: ForecastSpot[],
): Promise<{ points: CwaWavePoint[]; archiveBytes: number; forecastFiles: number; maxXmlBytes: number }> {
  const contentLength = response.headers.get("content-length");
  const declaredSize = contentLength === null ? null : Number(contentLength);
  if (declaredSize !== null && Number.isFinite(declaredSize) && declaredSize > MAX_ARCHIVE_BYTES) {
    throw new Error("CWA wave archive exceeds the download safety limit");
  }
  if (!response.body) {
    const archive = new Uint8Array(await response.arrayBuffer());
    const parsed = parseCwaWaveArchive(archive, spots);
    return { ...parsed, archiveBytes: archive.byteLength };
  }

  const parser = createCwaWaveArchiveParser(spots);
  const reader = response.body.getReader();
  let pending: Uint8Array | null = null;
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      parser.push(pending ?? new Uint8Array(), true);
      break;
    }
    received += value.byteLength;
    if (received > MAX_ARCHIVE_BYTES) {
      await reader.cancel("CWA wave archive exceeds the download safety limit");
      throw new Error("CWA wave archive exceeds the download safety limit");
    }
    if (pending) parser.push(pending, false);
    pending = value;
  }
  return { ...parser.finish(), archiveBytes: received };
}

async function fetchCwaWavePoints(
  apiKey: string,
  spots: ForecastSpot[],
  fetchImpl: typeof fetch,
) {
  const url = new URL(CWA_WAVE_URL);
  url.searchParams.set("Authorization", apiKey);
  url.searchParams.set("downloadType", "WEB");
  url.searchParams.set("format", "ZIP");
  const response = await fetchImpl(url, {
    headers: { accept: "application/zip, application/octet-stream" },
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`CWA wave returned HTTP ${response.status}`);
  return parseCwaWaveResponse(response, spots);
}

export async function fetchCwaSnapshots(
  spots: ForecastSpot[],
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CwaFetchResult> {
  const [wave, tideResult] = await Promise.all([
    fetchCwaWavePoints(apiKey, spots, fetchImpl),
    fetchCwaTideEvents(apiKey, fetchImpl)
      .then((events) => ({ events, error: null as string | null }))
      .catch((error: unknown) => ({
        events: new Map<string, CwaTideEvent[]>(),
        error: redactMessage(error, [apiKey]),
      })),
  ]);
  const snapshots = buildCwaSnapshots(wave.points, tideResult.events);
  if (!snapshots.length) throw new Error("CWA returned no usable 0–72 hour forecasts");
  const issued = snapshots.map((snapshot) => snapshot.issuedAt).sort();
  const runs = snapshots.map((snapshot) => snapshot.modelRunAt).sort();
  const valid = snapshots.map((snapshot) => snapshot.validAt).sort();
  return {
    snapshots,
    diagnostics: {
      archiveBytes: wave.archiveBytes,
      forecastFiles: wave.forecastFiles,
      maxXmlBytes: wave.maxXmlBytes,
      issuedAt: issued.at(-1) ?? null,
      modelRunAt: runs.at(-1) ?? null,
      firstValidAt: valid[0] ?? null,
      lastValidAt: valid.at(-1) ?? null,
    },
    warnings: [
      ...(tideResult.error ? [`CWA tide enrichment skipped: ${tideResult.error}`] : []),
      ...(!tideResult.error ? CWA_TIDE_LOCATION_IDS
        .filter((locationId) => !tideResult.events.has(locationId))
        .map((locationId) => `CWA tide response omitted approved location ${locationId}`) : []),
    ],
  };
}
