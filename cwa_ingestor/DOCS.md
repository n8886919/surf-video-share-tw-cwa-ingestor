# Surf Video Share CWA Ingestor

This Home Assistant App is an outbound-only provider compute adapter. It does
not expose a web UI or port and does not use Home Assistant, Supervisor, Docker,
host networking, devices, D-Bus, or the Home Assistant configuration folder.

## Configuration

- `worker_base_url`: the HTTPS Worker origin, without a path or query string.
- `cwa_api_key`: the CWA Open Data authorization key.
- `ingestion_secret`: the high-entropy value configured separately as the
  Worker's `FORECAST_INGESTION_SECRET`.

Both secret fields are entered only in the Home Assistant UI. Never put their
values in Git, documentation, logs, screenshots, or chat.

## Schedule and state

The app checks immediately after startup and then at `00:20`, `06:20`, `12:20`,
and `18:20` UTC. Transient failures use bounded exponential backoff. `/data`
contains only atomic JSON state and small normalized batches awaiting retry;
the complete CWA ZIP is never persisted.

Single-line logs begin with an explicit `Asia/Taipei` timestamp, a readable
description, and a stable event code in brackets. They report when an ingestion
attempt starts, inserted/duplicate counts, upstream run time, retry delay, and
warning/error details. All timestamps use local Taipei time. Validation errors
are condensed instead of printing escaped JSON.
Logs never include options, authorization headers, signatures, request bodies,
or query strings. A `stale_success` warning means no successful ingestion has
completed for more than seven hours.

The App requests the 17 approved F-A0021-001 locations once per run and maps
them to all 19 active spots through the reviewed nearest-location allowlist:

| LocationId | Active spot |
|---|---|
| `10002040` | 烏石港 |
| `O00400` | 雙獅 |
| `10002030` | 無尾 |
| `I02200` | 蜜月灣 |
| `I00900` | 金樽、北東河 |
| `I00500` | 漁光島 |
| `O00700` | 南灣 |
| `O00100` | 中角灣 |
| `I03800` | 福隆 |
| `I06100` | 環保 |
| `10015010` | 北濱 |
| `A00200` | 磯崎 |
| `10013330` | 九棚 |
| `O01000` | 佳樂水 |
| `10005020` | 松柏港 |
| `A01500` | 翡翠灣、萬里 |
| `I04100` | 外埔 |

The CWA key is sent only in the HTTPS Authorization header. The Worker
independently enforces the same mapping before any D1 write.

## Installation and update

Add this GitHub repository to **Settings → Apps → App store → Repositories**,
install **Surf Video Share CWA Ingestor**, enter the three options, then start
it. The target must report a supported architecture; the first verified target
is Raspberry Pi 4 `aarch64`.

For a local source build, copy the `cwa_ingestor` folder to
`/addons/cwa_ingestor`, reload the App store, and install the discovered local
app. Home Assistant Supervisor builds the image from the pinned official
`ghcr.io/home-assistant/base:3.24` base.

Before updating, create a Home Assistant backup containing this App. To roll
back, reinstall the prior Git tag/version and restore the App backup. A restore
recovers last-success metadata and pending normalized batches, but intentionally
does not contain any historical ZIP archive.

### Worker compatibility

App `0.4.0` sends Worker contract `cwa-forecast-ingestion-v4`. Both repositories
generate JSON Schema from the live Zod validator and assert fingerprint
`e09dbdb3ec07aa1d865cb2654181d5b7b2c6b42542cc308d0d9c936e9e5128f0`, plus
tide-mapping fingerprint
`196d6e0a139fe9d2eab525232e801ef5613a01b1c064f2e28b273e2d4177eb4e`
and the refinements that JSON Schema cannot encode. The App can retry persisted
v1/v2/v3 batches, and the Worker temporarily accepts all three older versions, so
deploy the backward-compatible Worker before updating the App.
Any request-field, bound, or mapping change must update both repositories as a
coordinated versioned release.

## Operational limitation

If Home Assistant is offline while CWA replaces an immutable forecast run, that
run can be missed. The app fetches only the latest available official data after
recovery and never fabricates or performs arbitrary historical backfill.
