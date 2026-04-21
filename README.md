# Foundry Audio Receiver

As with the **[Fryke’s Music Streamer](https://foundryvtt.com/packages/music-streamer)** - little floating player that let you pipe a live stream straight into Foundry - this module carries that idea into **Foundry v13**. You can stream your audio from *outside* Foundry (Winamp, SWYH, Icecast, whatever you run).

---

## Why bother?

Foundry’s built-in audio is great for ambience and playlists, but sometimes you want **one continuous feed** - your youtube audio, or any other audio programs on your computer - without wrestling the playlist UI. This module is the Foundry-side player for that.

The GM can set the **world stream URL**, and players either follow that or paste their own. When the GM changes it, everyone on the global setting gets the update.

---

## How does it work?

### Playlists tab

There’s an **Audio receiver** block you can expand. **Play** / **Stop**, toggle **Use global stream URL**, or paste **your own URL** right below. Then there’s a **Stream** volume slider for changing the audio volume.

### Configure Settings → module settings

**World**

- **Global stream URL**
- **Stream volume multiplier** - defaults to **×2** so quieter sources (e.g. SWYH) don’t disappear in the mix. Drop it to **1** if your source is already loud enough.

**Per user**

- Use the global URL or **your own stream URL**
- **Receiver volume** (what that Stream slider stores)
- **Play stream when the game loads** - browsers may still demand a click once for autoplay policy; that’s not a Foundry issue.

### Behaviour

- **Reconnect:** if the stream drops (common when nothing is playing into the source), the module retries with backoff.
- **Volume:** there is **no** automatic loudness fix. Use **Configure Settings → module → Stream volume multiplier** plus the **Stream** slider in Playlists until it sounds right.
- **CORS:** the game runs in a browser. If the stream URL is on another host/port than Foundry, the browser may block it. Open **DevTools (F12) → Console** and look for CORS errors. To put the stream behind the same origin as Foundry, use a reverse proxy; there is a **Caddy** example in `contrib/swyh-caddy-proxy/`.

---

## What you do (setup)

1. **Get a working stream URL** from something on your PC or network (MP3-style stream is typical). This module does not encode audio; it only plays the URL inside Foundry.
2. **Test the URL in VLC** (Media → Open Network Stream). If VLC will not play it, Foundry will not either.
3. In Foundry: **Configure Settings → module settings → World → Global stream URL** and paste the URL. Players can follow that or set their own in the **Playlists → Audio receiver** block.
4. **If players are remote:** your source must be reachable at that URL (firewall, port forward, or a tunnel). The module does not punch holes in your router.

**Typical paths**

- **Stream What You Hear (Windows):** install SWYH, start streaming, copy the stream URL it shows. If the browser blocks cross-origin requests, add a proxy so Foundry and the stream share one origin — follow `contrib/swyh-caddy-proxy/` and point the world URL at the proxied address. (If you are using another source, you can use a similar proxy.)
- **Icecast / SHOUTcast:** run the server, create a mount, send audio with a source client. Use the mount URL in Foundry, e.g. `http://yourhost:8000/stream` (your real host/port/mount).

---

## Limitations

- **Foundry v13** only.
- **Browser rules** apply: CORS, autoplay (you may need one user gesture before audio starts).
- **Leveling** is manual (multiplier + Stream slider).

---

## Install

Install from the package list, or copy this folder to `Data/modules/foundry-audio-receiver` and enable the module in the world.

**Developers:** see `DEV-PIPELINE.md` for build/link. If you touch `templates/audio-receiver-panel.hbs`, run `npm run compile:hbs` or `npm run build`.

---

## Tools (what they are for)

| Tool | What to use it for |
|------|-----------|
| [Stream What You Hear](http://www.streamwhatyouhear.com/) | Capture desktop/system audio on Windows and expose a stream URL. |
| [VLC](https://www.videolan.org/) | Verify the stream URL before pasting it into Foundry. |
| [Caddy](https://caddyserver.com/) | Reverse-proxy the stream so it matches Foundry's origin and avoids CORS; see `contrib/swyh-caddy-proxy/`. |
| [Icecast](https://icecast.org/) | Run a small streaming server; point Foundry at the mount URL. |
| [butt](https://danielnoethen.de/butt/) | Send audio from a mic/app into Icecast (or similar). |
| [ngrok](https://ngrok.com/) | Expose a local stream URL to the internet with a public HTTPS URL (optional for remote players). |