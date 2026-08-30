export const CWA_WAVE_URL = "https://opendata.cwa.gov.tw/fileapi/v1/opendataapi/F-A0020-001";
export const CWA_TIDE_URL = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-A0021-001";
export const CWA_PROVIDER = "cwa";
export const CWA_MODEL = "cwa-wave-f-a0020-001";
export const CWA_TIDE_LOCATION_IDS = [
  "O00400",
  "10002030",
  "O01200",
  "O01300",
  "B02400",
  "O00700",
] as const;
export const CWA_TIDE_LOCATION_BY_SPOT_ID = {
  "spot_wushi-harbor-north": "O00400",
  "spot_double-lions": "O00400",
  "spot_suao-wuwei-harbor": "10002030",
  "spot_daxi": "O01200",
  "spot_jinzun": "O01300",
  "spot_donghe": "O01300",
  "spot_yuguangdao": "B02400",
  "spot_nanwan": "O00700",
} as const satisfies Record<string, typeof CWA_TIDE_LOCATION_IDS[number]>;

export const MAX_ARCHIVE_BYTES = 96 * 1024 * 1024;
export const MAX_XML_BYTES = 8 * 1024 * 1024;
export const MAX_FORECAST_FILES = 90;
export const INGESTION_BATCH_SIZE = 5;

export const SPOTS_PATH = "/api/v1/internal/forecast-ingestion/spots";
export const CWA_INGESTION_PATH = "/api/v1/internal/forecast-ingestion/cwa";
export const SIGNATURE_VERSION = "1";
