# Surf Video Share CWA Ingestor

![Surf Video Share logo](cwa_ingestor/logo.png)

Home Assistant App repository for the trusted CWA compute adapter used by
`surf-video-share-tw`.

The app downloads the official CWA F-A0020-001 ZIP and the reviewed per-spot
F-A0021-001 tide locations, normalizes only the bounded 0–72 hour forecast
window on the Home Assistant host, then pushes small HMAC-authenticated batches to the public Worker. It
opens no inbound ports and has no Home Assistant, Supervisor, Docker, device,
or host-network access.

See [`cwa_ingestor/DOCS.md`](cwa_ingestor/DOCS.md) for installation,
configuration, recovery, and verification.
