export const CWA_WAVE_URL = "https://opendata.cwa.gov.tw/fileapi/v1/opendataapi/F-A0020-001";
export const CWA_TIDE_URL = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-A0021-001";
export const CWA_PROVIDER = "cwa";
export const CWA_MODEL = "cwa-wave-f-a0020-001";
export const CWA_TIDE_LOCATION_ID = "O00400";

export const MAX_ARCHIVE_BYTES = 96 * 1024 * 1024;
export const MAX_XML_BYTES = 8 * 1024 * 1024;
export const MAX_FORECAST_FILES = 90;
export const INGESTION_BATCH_SIZE = 5;

export const SPOTS_PATH = "/api/v1/internal/forecast-ingestion/spots";
export const CWA_INGESTION_PATH = "/api/v1/internal/forecast-ingestion/cwa";
export const SIGNATURE_VERSION = "1";
