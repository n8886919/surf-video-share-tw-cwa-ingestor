export const CWA_WAVE_URL = "https://opendata.cwa.gov.tw/fileapi/v1/opendataapi/F-A0020-001";
export const CWA_TIDE_URL = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-A0021-001";
export const CWA_PROVIDER = "cwa";
export const CWA_MODEL = "cwa-wave-f-a0020-001";
export const CWA_TIDE_LOCATION_IDS_V2 = [
  "O00400",
  "10002030",
  "O01200",
  "O01300",
  "B02400",
  "O00700",
] as const;
export const CWA_TIDE_LOCATION_BY_SPOT_ID_V2 = {
  "spot_wushi-harbor-north": "O00400",
  "spot_double-lions": "O00400",
  "spot_suao-wuwei-harbor": "10002030",
  "spot_daxi": "O01200",
  "spot_jinzun": "O01300",
  "spot_donghe": "O01300",
  "spot_yuguangdao": "B02400",
  "spot_nanwan": "O00700",
} as const satisfies Record<string, typeof CWA_TIDE_LOCATION_IDS_V2[number]>;

export const CWA_TIDE_LOCATION_IDS_V3 = [
  "10002040", "O00400", "10002030", "I02200", "I00900", "I00500",
  "O00700", "O00100", "I03800", "I06100", "10015010", "A00200",
  "10013330", "O01000", "10005020", "A01500",
] as const;
export const CWA_TIDE_LOCATION_BY_SPOT_ID_V3 = {
  "spot_wushi-harbor-north": "10002040",
  "spot_double-lions": "O00400",
  "spot_suao-wuwei-harbor": "10002030",
  "spot_daxi": "I02200",
  "spot_jinzun": "I00900",
  "spot_donghe": "I00900",
  "spot_yuguangdao": "I00500",
  "spot_nanwan": "O00700",
  "spot_zhongjiao-bay": "O00100",
  "spot_fulong": "I03800",
  "spot_environmental-park": "I06100",
  "spot_hualien-beibin": "10015010",
  "spot_jiqi": "A00200",
  "spot_jiupeng": "10013330",
  "spot_jialeshui": "O01000",
  "spot_songbai-harbor": "10005020",
  "spot_green-bay": "A01500",
  "spot_wanli": "A01500",
} as const satisfies Record<string, typeof CWA_TIDE_LOCATION_IDS_V3[number]>;

export const CWA_TIDE_LOCATION_IDS = [
  ...CWA_TIDE_LOCATION_IDS_V3,
  "I04100",
] as const;
export const CWA_TIDE_LOCATION_BY_SPOT_ID = {
  ...CWA_TIDE_LOCATION_BY_SPOT_ID_V3,
  "spot_waipu-fishing-harbor": "I04100",
} as const satisfies Record<string, typeof CWA_TIDE_LOCATION_IDS[number]>;

export const MAX_ARCHIVE_BYTES = 96 * 1024 * 1024;
export const MAX_XML_BYTES = 8 * 1024 * 1024;
export const MAX_FORECAST_FILES = 90;
export const INGESTION_BATCH_SIZE = 5;

export const SPOTS_PATH = "/api/v1/internal/forecast-ingestion/spots";
export const CWA_INGESTION_PATH = "/api/v1/internal/forecast-ingestion/cwa";
export const CWA_INGESTION_COMPLETE_PATH = "/api/v1/internal/forecast-ingestion/cwa/complete";
export const SIGNATURE_VERSION = "1";
