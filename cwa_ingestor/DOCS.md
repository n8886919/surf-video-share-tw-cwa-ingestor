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

Structured logs report attempts, inserted/duplicate counts, upstream run time,
and warning/error codes. They never include options, authorization headers,
signatures, request bodies, or query strings. A `stale_success` warning means no
successful ingestion has completed for more than seven hours.

The App requests the six approved F-A0021-001 locations once per run and maps
them to the eight active spots: `O00400` for 烏石港／雙獅, `10002030` for 無尾,
`O01200` for 蜜月灣, `O01300` for 金樽／北東河, `B02400` for 漁光島, and
`O00700` for 南灣. The CWA key is sent only in the HTTPS Authorization header.
The Worker independently enforces the same mapping before any D1 write.

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

App `0.2.0` sends Worker contract `cwa-forecast-ingestion-v2`. Both repositories
generate JSON Schema from the live Zod validator and assert fingerprint
`24eeaed68e8e358880f43c127dde715af5c36b7af80a5667d58a67481d01c296`, plus
tide-mapping fingerprint
`217b188f9b366cb50aad2566135c5c04cab60c593d5a553306b33ba25714a5e3`
and the refinements that JSON Schema cannot encode. The Worker temporarily
accepts persisted v1 batches, so deploy the Worker before updating the App.
Any request-field, bound, or mapping change must update both repositories as a
coordinated versioned release.

## Operational limitation

If Home Assistant is offline while CWA replaces an immutable forecast run, that
run can be missed. The app fetches only the latest available official data after
recovery and never fabricates or performs arbitrary historical backfill.
