# Foundry Audio Receiver (v13) — Implementation Plan (no coding yet)

This document is the **single source of truth** for how we will implement `foundry-audio-receiver` for Foundry VTT **v13**.

Goal: when we start coding, there should be **no ambiguity** about architecture, APIs, UX, or risk areas.

## Non-goals (explicit)

- We are **not** implementing anything yet.
- We are **not** copying code from existing modules. We can reuse *ideas and patterns*, not verbatim code.
- We are **not** dealing with VBAN directly. This project targets **SWYH-style HTTP streaming**.

## Context and constraints (Foundry v13)

- Module scripts are loaded via the manifest’s `"esmodules"` or `"scripts"` list. Foundry’s recommended approach is ESModules (`"esmodules"`). See the official Module Development docs: `https://foundryvtt.com/article/module-development/`.
- Module code runs in the **game view** (not Setup/Join screens) and must be robust to Foundry’s version churn.
- Foundry v13 introduces/encourages newer application patterns (ApplicationV2); for draggable UI, Foundry provides `foundry.applications.ux.Draggable` and ApplicationV2 has a `position` concept:
  - `https://foundryvtt.com/api/v13/classes/foundry.applications.api.ApplicationV2.html`
  - `https://foundryvtt.com/api/v13/classes/foundry.applications.ux.Draggable.html`

## Feasibility notes (validated against public v13 docs)

This section records what appears **supported by public v13 APIs** vs what is likely to require risky UI patching.

### Confirmed / well-supported

- **Loading module code** via `"esmodules"` and driving logic via hooks like `init`/`ready` is explicitly documented.  
  Ref: `https://foundryvtt.com/article/module-development/`

- **Module socket channel** exists when `"socket": true` is set in the manifest; the server relays messages on `module.<id>`.  
  Ref: `https://foundryvtt.com/article/module-development/` (manifest `socket` field)

- **Settings** via `game.settings.register(...)` is a stable, public approach; settings must be registered during `init`.  
  Ref: `https://foundryvtt.com/api/v13/classes/foundry.helpers.ClientSettings.html` (ClientSettings), and community summary: `https://foundryvtt.wiki/en/development/api/settings`

- **Draggable UI** can be implemented using Foundry’s public `Draggable` helper rather than custom mousemove logic.  
  Ref: `https://foundryvtt.com/api/v13/classes/foundry.applications.ux.Draggable.html`

- **Audio playback** has public APIs (`foundry.audio.Sound`, `foundry.audio.AudioHelper` / `game.audio`) which explicitly support remote URLs and internally use either an AudioBufferSource or a MediaElementAudioSource.  
  Refs:
  - `https://foundryvtt.com/api/v13/classes/foundry.audio.AudioHelper.html`
  - `https://foundryvtt.com/api/v13/classes/foundry.audio.Sound.html`

Practical implication for our module:
- Prefer going through `game.audio` / `Sound` to integrate cleanly with Foundry’s audio system (volume routing, lifecycle), instead of managing a raw `new Audio()` ourselves.

### Staff guidance (Foundry moderators / community)

Corroborates our approach and clears up a common confusion:

- **Injecting a UI block into the Playlists tab** → use the **render hook** `renderPlaylistDirectory`, not the sidebar “context” hooks.
- Hook shape (per staff): **first argument** is the **application instance** (`PlaylistDirectory`), **second** is the **`HTMLElement`** you append/patch for your UI.
- **`getEntryContextAbstractSidebarTab` / `getFolderContextAbstractSidebarTab`** are for **right-click context menus** on sidebar entries/folders. They do **not** add a new visual section to the tab.
- **AudioHelper** is the core of Foundry’s built-in volume UX; staff noted there may **not** be a clean, supported path to add “another slider” identical to core’s without digging into internals. Our module does **not** need that: we add **our own controls** in injected DOM and drive playback via **`Sound` / `game.audio`** (or fallback `HTMLAudioElement`) for the stream URL—not by pretending to be a fourth core channel.

**v13 render context (the doc you found):** [`foundry._PlaylistDirectoryRenderContext`](https://foundryvtt.com/api/v13/interfaces/foundry._PlaylistDirectoryRenderContext.html) describes the **data** core passes when rendering the Playlists tab: built-in volume rows (`controls.environment` / `interface` / `music`), `currentlyPlaying`, and the `tree`. Use it to **understand** what is already on screen and to avoid colliding with core markup—not as a place to “register” a fourth channel. Our module still adds UI via **`renderPlaylistDirectory`** DOM injection.

- Class entry point: `https://foundryvtt.com/api/v13/classes/foundry.applications.sidebar.tabs.PlaylistDirectory.html`

### Playlists tab injection (public hook + caveats)

- **Feasible:** `Hooks.on("renderPlaylistDirectory", ...)` — render hook for the Playlists sidebar tab (`PlaylistDirectory`, ApplicationV2).  
  Ref: `https://foundryvtt.com/api/v13/functions/hookEvents.renderApplicationV2.html`
- **Class / context:**  
  - `https://foundryvtt.com/api/v13/classes/foundry.applications.sidebar.tabs.PlaylistDirectory.html`  
  - `https://foundryvtt.com/api/v13/interfaces/foundry._PlaylistDirectoryRenderContext.html`

**v13 gotcha:** the second argument is a **plain DOM `HTMLElement`**, not jQuery. Use `querySelector`, `append`, `addEventListener`, etc.  
Ref: `https://foundryvtt.wiki/en/development/guides/applicationV2-conversion-guide`

**Caveat:** insertion still depends on **where** in that element we attach (sibling of existing controls vs end of panel). Prefer **append** to a stable inner region if one exists, or document a single chosen anchor; re-test after Foundry updates.

**Also supported (separate use):** context menu extensions via `getEntryContextAbstractSidebarTab` / `getFolderContextAbstractSidebarTab` — e.g. “Open Audio Receiver settings”, not the main volume row.

## Requirements (functional)

### Core behavior

- **Connect to a single configured HTTP audio stream URL** which is playable by Chromium (Foundry’s client).
- **Play that stream for Foundry clients** with:
  - Play / Stop
  - Volume control
  - Stream configuration UI (at minimum: the URL)
- **One-time world configuration**: the stream source is typically set once and left alone.
- **Per-user volume**: each user’s volume is local to them (should not be forced by GM).

### Primary emitter target (what we will design for first)

We have validated that **Stream What You Hear (SWYH)** can expose a browser-playable MP3 stream URL like:

- `http://<LAN-IP>:5901/stream/swyh.mp3`

SWYH is attractive because it is a **single Windows app** which:
- captures system audio
- encodes to MP3
- serves an HTTP stream (no separate Icecast server)

Reference: `https://www.streamwhatyouhear.com/`

Therefore, **the v1 implementation plan targets “HTTP MP3 stream URL playback”** first.

We may add other emitter types later, but they are not required for the first working version.

### UX expectations

We want the convenience of Fryke’s module (a small always-available controller), but with a modernized v13 approach.

Candidate UX patterns (we must pick one before coding):

1. **Playlists sidebar integration (preferred if feasible using public APIs)**
   - Goal: reuse the existing Playlists UX where users already expect per-user volume controls.
   - Shape: a clearly labeled section (e.g. “Audio Receiver”) with:
     - Play / Stop
     - One volume slider
   - Public implementation approach:
     - Use `Hooks.on("renderPlaylistDirectory", ...)` and inject our section into the rendered DOM.
     - Use DOM APIs (`querySelector`, `addEventListener`) because v13 render hooks provide a DOM element (not jQuery).
   - Caution:
     - This is still DOM-structure dependent; keep selectors minimal and resilient.

2. **Docked widget + toolbar toggle (fallback)**
   - A compact draggable panel anchored near the hotbar.
   - Add a new tool in the scene controls toolbar that toggles show/hide.
   - Persist per-user: visibility, position, volume.

3. **Sidebar tab / Settings menu**
   - Clean, but typically too slow for “hit play during a cutscene”.

Decision criteria:
- Minimal clicks during play
- Doesn’t interfere with other UI
- Works in v13 without private API overrides
- Position persistence is reliable

## Reality check: what browsers (and Foundry) can play

Fryke’s Music Streamer is effectively: **Foundry UI + HTMLAudioElement + a URL** (HTTP audio stream).

Our v1 architecture is intentionally simple:

> **SWYH → HTTP MP3 URL → Foundry module plays it**

Optional later: support generic SHOUTcast/Icecast-style HTTP stream URLs as an additional input type (same “URL in → play/stop/volume out” contract).

### Option A (future / low-latency): WebSocket PCM + WebAudio

Emitter exposes a **WebSocket** endpoint that streams PCM frames (e.g. PCM16LE).

**Architecture**
- Emitter (external) publishes PCM frames over WebSocket (protocol to be defined).
- Foundry module connects to WebSocket and plays audio using the Web Audio API (AudioContext + AudioWorklet; ScriptProcessor only as a last-resort fallback).
- Foundry module provides UI (play/stop/volume) and persists user settings locally.

**Pros**
- Low latency is feasible (jitter buffer + predictable chunk sizes).
- Works even if the emitter is not HTTP-audio capable (no transcoding required).

**Cons**
- Requires a custom WebAudio pipeline (worklet + buffering).

### Option B (v1 target): HTTP audio stream + HTMLAudioElement

Emitter serves a browser-decodable codec over HTTP (e.g. MP3/AAC/Opus in a container the browser accepts).

Foundry module uses standard browser playback (`HTMLAudioElement` or WebAudio `MediaElementAudioSourceNode`) and just controls volume/play/stop.

**Pros**
- Simplest client-side playback logic.

**Cons**
- Requires transcoding (CPU + latency + more moving parts).
- Stream format and browser decode support become the emitter’s problem.

### Option C (potential feature): WebRTC audio

Emitter acts as a WebRTC publisher, Foundry clients subscribe (SFU-style or direct, depending on emitter).

**Pros**
- Designed for real-time audio over the internet with jitter handling.

**Cons**
- Signaling + NAT traversal complexity.
- Overkill for many LAN use cases.

WebRTC is explicitly *not* planned for v1 because it adds signaling/NAT complexity that isn’t needed for background music.

## Plan of attack (phased, with explicit decision gates)

### Phase 0 — Confirm dependencies are reasonable (no changes yet)

Current `package.json` is build/pipeline tooling only.

- **Keep**: `gulp`, `fs-extra`, `archiver`, `yargs`, `chalk` (pipeline)
- **Probably removable later** (but we won’t change yet): `electron`, `xhr2`, `json-stringify-pretty-compact`
  - `electron` was historically used for a debug launcher; if we keep VSCode launch configs it may still be fine.
  - `xhr2` was used for GitLab upload automation; our boilerplate removed release automation, so it may become dead weight.
  - `json-stringify-pretty-compact` was used for manifest rewriting; currently unused.

**Action later (when allowed)**: run a quick static check (“is it required by gulpfile/scripts?”) and remove unused devDependencies.

### Phase 1 — Validate Foundry execution constraints (must do before audio work)

We must verify (empirically) the runtime boundaries that matter for client-only audio playback:

- Web Audio API support inside Foundry’s Chromium/Electron build.
- WebSocket connectivity to the chosen emitter URL (mixed content rules, TLS, LAN hostnames).
- Audio autoplay restrictions and the need for a user gesture before playback.

**Deliverable**
- A short “runtime matrix” note inside this plan (updated after testing) stating:
  - Client: what audio primitives work (AudioContext, AudioWorklet, HTMLAudioElement)
  - Network: what URL types work in your deployment (ws/wss/http/https)

### Phase 2 — Define the “audio transport contract” (the key technical design)

We need a precise contract between receiver and Foundry clients.

#### Contract for v1 (Option B: HTTP MP3)

For SWYH-style emitters, the contract is intentionally minimal:

- A **stable HTTP URL** which returns an MP3 stream playable by Chromium.
- The module treats the URL as an opaque string.

Implementation implication:
- Prefer `HTMLAudioElement` for maximum compatibility.
- Use a `GainNode` only if we need additional processing; otherwise rely on `audio.volume` (per-user).

#### Proposed contract (future Option A: WebSocket PCM)

**Emitter → WS payload**
- Messages are binary frames with a small header (our protocol):
  - protocol version
  - sampleRate (Hz)
  - channels (1/2)
  - format (PCM16LE recommended)
  - sequence number + timestamp
  - payload: interleaved PCM16LE samples

**Client playback**
- WebAudio pipeline:
  - `AudioContext`
  - `AudioWorkletNode` which:
    - receives PCM chunks via `MessagePort` (or SharedArrayBuffer ring buffer if we want higher performance later)
    - outputs float32 samples
  - `GainNode` for per-user volume
  - Destination

**Jitter buffer**
- Keep ~100–300ms buffered audio to smooth UDP jitter.
- Drop/insert silence on underrun rather than stalling.

**Why not HTMLAudioElement?** (for Option A)
- HTMLAudio wants a URL that the browser can decode (MP3/AAC/Opus/etc).
- Raw PCM-over-WebSocket is not that; it requires WebAudio playback.
- WebAudio PCM path is direct and controllable.

#### Alternative contract (if we choose to transcode)

Emitter runs ffmpeg (or equivalent) and exposes an HTTP stream (HLS/MP3/etc).
Then Foundry uses `new Audio(url)` like Fryke’s module.

**This is a fallback** if WS+Worklet proves too complex, but it’s less elegant and adds external dependencies.

### Phase 3 — UX design (modernize Fryke’s concept without copying)

We want the *behavior* from Fryke’s Music Streamer (source config + play/stop + volume + persistence + GM broadcast), but implemented in a v13-appropriate way.

Observations from Fryke’s module (source: `https://github.com/Tmktahu/foundry/tree/master/music-streamer`, v9-era):
- Uses a small always-visible widget (`popOut: false`) with custom manual drag handlers.
- Persists position via `game.user.setFlag(...)`.
- Broadcasts GM updates using `game.socket.emit('module.music-streamer', ...)` and listens with `game.socket.on(...)`.

What we will do differently in v13:
- Use **ApplicationV2** (or a lightweight DOM injection) with Foundry’s drag utilities if applicable.
- Use **`input`** events for volume (more responsive than `change`).
- Persist:
  - Stream config: world setting (GM-controlled)
  - Volume + widget position: user setting/flag
- Avoid global `window.*` singletons as the primary control surface; expose a small API only if needed for macros.

#### UX steps (implementation detail)

1. **Player widget**
   - Displays status (Disconnected / Buffering / Playing / Error).
   - Buttons: Play, Stop, Settings (toggle).
   - Slider: Volume (0–100).

2. **Settings panel**
   - Fields for emitter connection (depending on chosen transport):
     - `emitterUrl` (e.g. `ws://host:port/stream` or `https://.../stream.mp3`)
     - optional token / key if the emitter requires it
   - Optional selection:
     - stream name (only if the emitter multiplexes multiple streams)

3. **Persistence**
   - On open: load per-user position + volume.
   - On drag end: store position per-user.
   - On volume change: store per-user.

4. **GM broadcast**
   - De-emphasized: source config is typically set once.
   - Still implement: when GM changes `emitterUrl`, broadcast a “reconnect” so everyone updates without manual steps.

### Phase 4 — Module networking design (Foundry sockets/settings)

We need a clean separation:
- **Foundry module socket**: for synchronizing configuration and “reconnect now” events.
- **Emitter stream channel**: the actual audio transport (WebSocket PCM, HTTP audio stream, or WebRTC).

#### Proposed Foundry socket messages

Channel: `module.foundry-audio-receiver`

Message types:
- `config:update` (GM → all)
  - payload: receiver host/port/stream settings (no secrets)
- `player:command` (optional; GM → all)
  - `play` / `stop` (only if we want GM to force start/stop)

Client behavior:
- On `config:update`: update stored world config, reconnect if currently playing or if “auto-reconnect” is enabled.

### Phase 5 — Emitter specification (SWYH-first)

This is not part of the Foundry module code, but the module depends on it being available as a URL.
We must specify its required behavior so the module can be implemented confidently.

**Responsibilities**
- Capture a chosen Windows audio source and expose it as a browser-playable HTTP stream URL (MP3).
- Provide minimal health metadata (optional but strongly recommended)

**Configuration**
- Port
- Codec/format (MP3 recommended for browsers)
- Bitrate/stereo
- Audio source device selection

**Security**
- LAN by default; no internet exposure recommended.
- Optional simple shared token on WS connection to avoid accidental LAN hijack.

**Operational UX**
- Provide an obvious “copy stream URL” affordance in SWYH (if available) or documented steps for users.

### Phase 6 — Testing plan (what we must prove)

Before release, we must validate:

1. **Connectivity**
   - Foundry clients can reach the configured URL (LAN + port-forwarded WAN as applicable).

2. **Audio correctness**
   - Sample rate and channel mapping is correct.
   - No clipping; no speed/pitch issues.

3. **Latency/jitter resilience**
   - For HTTP MP3 (SWYH): confirm the delay is acceptable and stable (it likely will be).
   - If we want to reduce delay: document the emitter-side knobs first (bitrate, buffering) before switching transport.

4. **Multi-client behavior**
   - Multiple connected players do not degrade receiver.
   - GM config update triggers reconnect everywhere.

5. **Foundry lifecycle**
   - Reload world: widget reinitializes correctly.
   - Disable module: closes audio context / stops WS.

## Detailed “coding steps” checklist (when we do start coding)

This is intentionally very explicit so we don’t wander.

### Step set A — Foundry module skeleton

- Update `src/module.json`:
  - add `"styles"` for our widget css (later)
  - add `"templates"` if we choose Handlebars templates
  - add `"socket": true` only if required by v13 manifest (v13 uses relationships; we’ll verify)
- Create module entry `src/main.js`:
  - register settings
  - register socket listeners on `ready`
  - initialize UI once per client

### Step set B — Settings and persistence

- World settings (GM-controlled):
  - receiver connection info + stream selection
- User settings:
  - volume (0..1)
  - widget position
  - “auto-play on ready” toggle (optional)

### Step set C — UI implementation

- Choose UI base:
  - ApplicationV2 vs lightweight DOM injection
- Implement:
  - widget render
  - event listeners (play/stop/settings/volume/drag)
  - position persistence

### Step set D — Audio engine

- Build `AudioEngine` abstraction:
  - `connect(config)`
  - `disconnect()`
  - `setVolume(v)`
  - emits events: `statechange`, `error`, `stats`
- Implement WS client:
  - backoff reconnect
  - decode PCM16LE → float32
  - jitter buffer feeding worklet

### Step set E — (optional) Alternative emitters

- If we decide to support more than SWYH:
  - SHOUTcast/Icecast-like URLs (still just HTTP audio playback in Foundry)
  - a low-latency WebSocket-PCM emitter (Option A)

### Step set F — Integration and final polish

- Validate that no private Foundry APIs are required.
- Add diagnostics:
  - current buffer depth (ms)
  - packet loss estimate
- Add a “copy connection info” UX for LAN setups.

## Risk register (things that can blow up)

1. **Foundry runtime limitations**
   - If we assume Node APIs are available and they aren’t, we waste time. This is why Phase 1 exists.

2. **AudioWorklet availability**
   - Electron should support it; still, implement a fallback strategy (or require it).

3. **Emitter variability**
   - Different emitters may set different headers/codecs/bitrate and cause different buffering behavior.

4. **Network**
   - UDP jitter and packet loss can cause stutter without buffering.
   - HTTP MP3 streams can introduce buffering latency; acceptable for background music, but may be noticeable.

5. **Plagiarism/licensing**
   - We must not copy Fryke’s code. We can cite it as inspiration and use the public Foundry APIs.
   - Reference-only sources:
     - Music Streamer listing: `https://foundryvtt.com/packages/music-streamer`
     - Music Streamer repo: `https://github.com/Tmktahu/foundry/tree/master/music-streamer`

## Open decisions (must be resolved before coding)

1. **Primary UX pattern**
   - Prefer Playlists integration if it can be implemented without private API overrides.
   - Otherwise: docked widget + toolbar toggle.

4. **Auth**
   - Do we need a shared token for the emitter URL?

## Latency notes (how far we can “fix delay” without changing transport)

Given your stated use case (background music), the priority is: **stable playback** > **lowest latency**.

What we can do within HTTP MP3:
- Keep the module simple: `HTMLAudioElement` tends to behave better than bespoke buffering.
- Avoid unnecessary buffering on the client (don’t proxy the stream through Foundry).
- Prefer a LAN URL when possible.

If latency becomes a real issue later:
- First, adjust **emitter settings** (SWYH bitrate and any buffering knobs it exposes).
- Only then consider upgrading to **Option A (WebSocket PCM)** or **Option C (WebRTC)**, which are inherently lower-latency but more complex.

## Next action (still no coding)

Run a short “design validation” session and update this plan with outcomes:

- Confirm Foundry module runtime constraints (Phase 1).
- Decide the transport (Phase 2) and UX (Phase 3).
- Freeze the message contract and settings list.

