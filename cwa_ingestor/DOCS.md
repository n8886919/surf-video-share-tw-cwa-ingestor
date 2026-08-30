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

## Operational limitation

If Home Assistant is offline while CWA replaces an immutable forecast run, that
run can be missed. The app fetches only the latest available official data after
recovery and never fabricates or performs arbitrary historical backfill.
