# Foundry Audio Receiver

Foundry **v13** module: play an **HTTP MP3 stream** (e.g. Stream What You Hear) from the playlist sidebar, with GM vs per-user URL and volume.

## Install

Copy or link the module into your Foundry user data `Data/modules/foundry-audio-receiver` (see `src/module.json`). Enable it in your world.

## SWYH and Caddy (browser / CORS)

Foundry runs on one origin (e.g. `http://localhost:30000`); SWYH serves the stream on another host/port. Browsers block embedding that stream in the page unless the response includes CORS headers or the stream is **same origin** as Foundry.

**Practical fix:** run [Caddy](https://caddyserver.com/) as a **reverse proxy** in front of SWYH. SWYH must still be running (Caddy only forwards traffic and adds CORS; it cannot generate the audio).

The bundled `Caddyfile` uses **Caddy on 5901** and **SWYH on 5910** so the URL you share matches the familiar stream port (5901) while nothing else fights for that bind:

1. Copy `contrib/swyh-caddy-proxy/` wherever you like.
2. In **SWYH**, set the HTTP stream port to **5910** (not 5901).
3. Download `caddy.exe` into that folder (or install Caddy on `PATH`).
4. Run `run-caddy-proxy.bat`. Caddy listens on **5901** and proxies to `127.0.0.1:5910`.
5. In Foundry, use **`http://127.0.0.1:5901/stream/swyh.mp3`** (or your LAN/public host with **5901**). Players never need the 5910 URL.

Tighten `Access-Control-Allow-Origin` in the `Caddyfile` to your real Foundry URL instead of `*` if you prefer.

## Development

`gulp link` and config: see `DEV-PIPELINE.md`.
