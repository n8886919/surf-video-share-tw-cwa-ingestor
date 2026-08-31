import { strToU8, zipSync } from "fflate";
import { CWA_TIDE_LOCATION_IDS } from "../src/constants.js";

export const testSpot = {
  id: "spot_wushi-harbor-north",
  slug: "wushi-harbor-north",
  latitude: 24.8731036,
  longitude: 121.8411446,
};

function legacyWaveXml(input: {
  identifier: string;
  validAt: string;
  value: number;
  measures: string;
}): string {
  return `<root>
<identifier>${input.identifier}</identifier>
<sent>2026-08-25T00:20:00+00:00</sent>
<dataTime>${input.validAt}</dataTime>
<location><lat>24.87</lat><lon>121.84</lon><elementValue><value>${input.value}</value><measures>${input.measures}</measures></elementValue></location>
<location><lat>22.00</lat><lon>120.00</lon><elementValue><value>999</value><measures>${input.measures}</measures></elementValue></location>
</root>`;
}

export function cwaWaveFixture(): Uint8Array {
  const validAt = "2026-08-25T03:00:00+00:00";
  return zipSync({
    "26082500-hs.003.xml": strToU8(legacyWaveXml({ identifier: "height-id", validAt, value: 82, measures: "0.01m" })),
    "26082500-t.003.xml": strToU8(legacyWaveXml({ identifier: "period-id", validAt, value: 713, measures: "0.01s" })),
    "26082500-dir.003.xml": strToU8(legacyWaveXml({ identifier: "direction-id", validAt, value: 96, measures: "1degr." })),
    "26082500-hs.004.xml": strToU8(legacyWaveXml({ identifier: "ignored", validAt, value: 99, measures: "0.01m" })),
  });
}

function currentWaveXml(input: {
  elementTag: string;
  value: number;
  measures: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<cwaopendata xmlns="urn:cwa:gov:tw:cwacommon:0.1">
  <Identifier>current-run-id</Identifier>
  <Sent>2026-08-25T14:58:36+08:00</Sent>
  <Dataset><DatasetInfo>
    <ForecastHour>3</ForecastHour><DateTime>2026-08-25T11:00:00+08:00</DateTime>
    <WeatherElements><WeatherElement><Measures>${input.measures}</Measures></WeatherElement></WeatherElements>
  </DatasetInfo><Data>
    <Location><Latitude>24.90000</Latitude><Longitude>121.90000</Longitude><${input.elementTag}>${input.value}</${input.elementTag}></Location>
  </Data></Dataset>
</cwaopendata>`;
}

export function currentCwaWaveFixture(): Uint8Array {
  return zipSync({
    "26082500-hs.003.xml": strToU8(currentWaveXml({ elementTag: "WaveHeight", value: 1.7, measures: "0.01m" })),
    "26082500-t.003.xml": strToU8(currentWaveXml({ elementTag: "WavePeriod", value: 9.9, measures: "0.01s" })),
    "26082500-dir.003.xml": strToU8(currentWaveXml({ elementTag: "WaveDirection", value: 122, measures: "1degr." })),
    "26082500-hs.004.xml": strToU8(currentWaveXml({ elementTag: "WaveHeight", value: 99, measures: "0.01m" })),
  });
}

export function tideFixture() {
  const locations = CWA_TIDE_LOCATION_IDS.map((locationId) => [locationId, 0, 0] as const);
  return {
    records: {
      TideForecasts: locations.map(([LocationId, Latitude, Longitude]) => ({
        Location: {
          LocationId,
          Latitude,
          Longitude,
          TimePeriods: {
            Daily: [{
              Time: [
                { DateTime: "2026-08-25T00:00:00+00:00", Tide: "\u4e7e\u6f6e", TideHeights: { AboveLocalMSL: "20" } },
                { DateTime: "2026-08-25T06:00:00+00:00", Tide: "\u6eff\u6f6e", TideHeights: { AboveLocalMSL: 120 } },
              ],
            }],
          },
        },
      })),
    },
  };
}
