import {
	MODULE_ID,
	SETTINGS,
	STREAM_FORMAT,
	HTTP_STREAM_GAIN_MULTIPLIER,
} from "./constants.js";

/** @type {foundry.audio.Sound | null} */
let _sound = null;
/** @type {string} */
let _loadedSrc = "";
/** Whether the user last chose Play (survives URL changes and stream drops). */
let _userWantsPlayback = false;

/** @type {(() => void) | null} */
let _notifyPanel = null;

/** @type {ReturnType<typeof setTimeout> | null} */
let _reconnectTimer = null;
/** Backoff step after consecutive failures (reset on success or explicit Play). */
let _reconnectAttempt = 0;

/** Invalidates in-flight load/play when incremented (stop, new Play, or settings URL change). */
let _playbackGen = 0;
/** Serializes attempts so overlapping load/play cannot leave two Sounds alive. */
let _playbackQueue = Promise.resolve();
/** True during an enqueued run (for UI: spinner on stop). */
let _attemptInFlight = false;

/** @type {{ el: HTMLAudioElement; onError: () => void; onEnded: () => void } | null} */
let _mediaListeners = null;
/** Ignore spurious media `error`/`ended` right after pipeline start (ms since epoch). */
let _ignoreMediaDropUntil = 0;

/** Separate from `game.audio.music` so core Music volume does not stack with our gain. */
let _receiverAudioContext = null;

const RETRY_INITIAL_MS = 1500;
const RETRY_MAX_MS = 28000;
const RETRY_BACKOFF = 1.6;

/**
 * @param {(() => void) | null} fn
 */
export function setPanelRefreshCallback(fn) {
	_notifyPanel = fn;
}

function notifyPanel() {
	try {
		_notifyPanel?.();
	} catch (_) {
		/* ignore */
	}
}

function clearReconnectTimer() {
	if (_reconnectTimer != null) {
		clearTimeout(_reconnectTimer);
		_reconnectTimer = null;
	}
}

function reconnectDelayMs() {
	const base = RETRY_INITIAL_MS * RETRY_BACKOFF ** _reconnectAttempt;
	return Math.min(RETRY_MAX_MS, base) + Math.random() * 350;
}

function detachMediaListeners() {
	if (!_mediaListeners) {
		return;
	}
	const { el, onError, onEnded } = _mediaListeners;
	el.removeEventListener("error", onError);
	el.removeEventListener("ended", onEnded);
	_mediaListeners = null;
}

function attachMediaListeners(sound) {
	detachMediaListeners();
	const el = sound.element;
	if (!(el instanceof HTMLAudioElement)) {
		return;
	}
	const onMediaStopped = () => {
		if (!_userWantsPlayback || Date.now() < _ignoreMediaDropUntil) {
			return;
		}
		console.warn(`${MODULE_ID} | stream media ended or errored; will retry`);
		handleStreamUnavailable();
	};
	const onError = () => onMediaStopped();
	const onEnded = () => onMediaStopped();
	el.addEventListener("error", onError);
	el.addEventListener("ended", onEnded);
	_mediaListeners = { el, onError, onEnded };
}

/**
 * SWYH and similar sources can close the HTTP connection when there is no PCM;
 * the media element then errors or ends. Tear down and schedule reconnect.
 */
function handleStreamUnavailable() {
	if (!_userWantsPlayback) {
		return;
	}
	detachMediaListeners();
	if (_sound) {
		try {
			void _sound.stop({ fade: 0 });
		} catch (_) {
			/* ignore */
		}
		_sound = null;
	}
	_loadedSrc = "";
	_reconnectAttempt = Math.min(_reconnectAttempt + 1, 24);
	scheduleReconnect();
	notifyPanel();
}

function scheduleReconnect() {
	if (!_userWantsPlayback || !getEffectiveStreamUrl()) {
		return;
	}
	clearReconnectTimer();
	_reconnectTimer = setTimeout(() => {
		_reconnectTimer = null;
		if (!_userWantsPlayback || _sound?.playing) {
			return;
		}
		void enqueuePlayback({ bumpGeneration: false });
	}, reconnectDelayMs());
	notifyPanel();
}

/**
 * @param {{ bumpGeneration: boolean }} opts
 * @returns {Promise<void>}
 */
function enqueuePlayback(opts) {
	_playbackQueue = _playbackQueue
		.catch(() => {})
		.then(() => runPlaybackAttempt(opts));
	return _playbackQueue;
}

/**
 * @param {{ bumpGeneration: boolean }} opts
 * @returns {Promise<void>}
 */
async function runPlaybackAttempt(opts) {
	const bumpGen = Boolean(opts.bumpGeneration);
	if (bumpGen) {
		_playbackGen++;
	}
	const myGen = _playbackGen;

	const url = getEffectiveStreamUrl();
	if (!url || !_userWantsPlayback) {
		return;
	}

	_attemptInFlight = true;
	notifyPanel();

	try {
		await ensureReceiverAudioReady();
		if (myGen !== _playbackGen || !_userWantsPlayback) {
			return;
		}

		const fmt = getStreamFormat();
		if (fmt === STREAM_FORMAT.SHOUT) {
			/* same path for now */
		}

		if (_sound?.playing && _loadedSrc === url) {
			_reconnectAttempt = 0;
			clearReconnectTimer();
			return;
		}

		disposeSound();
		if (myGen !== _playbackGen || !_userWantsPlayback) {
			return;
		}

		_sound = new foundry.audio.Sound(url, { context: getReceiverAudioContext() });
		_loadedSrc = url;

		const vol = getReceiverVolume();
		await _sound.load();
		if (myGen !== _playbackGen || !_userWantsPlayback) {
			disposeSound();
			return;
		}

		attachMediaListeners(_sound);
		_ignoreMediaDropUntil = Date.now() + 800;
		await _sound.play({ loop: true, volume: 1 });
		if (myGen !== _playbackGen || !_userWantsPlayback) {
			return;
		}

		if (_sound.gain) {
			_sound.gain.value = toReceiverGain(vol);
		}

		_reconnectAttempt = 0;
		clearReconnectTimer();
	} catch (err) {
		console.warn(`${MODULE_ID} | playback attempt failed`, err);
		disposeSound();
		if (_userWantsPlayback && getEffectiveStreamUrl()) {
			_reconnectAttempt = Math.min(_reconnectAttempt + 1, 24);
			scheduleReconnect();
		}
	} finally {
		_attemptInFlight = false;
		notifyPanel();
	}
}

/**
 * v13: `game.audio.unlock` is a Promise, not a function.
 * @returns {Promise<void>}
 */
async function waitForAudioUnlocked() {
	const a = game.audio;
	if (!a) {
		return;
	}
	const u = a.unlock;
	if (u != null && typeof u.then === "function") {
		await u;
		return;
	}
	if (typeof u === "function") {
		await u.call(a);
		return;
	}
	if (typeof a.awaitFirstGesture === "function") {
		await a.awaitFirstGesture();
	}
}

function getReceiverAudioContext() {
	if (!_receiverAudioContext) {
		_receiverAudioContext = new AudioContext();
	}
	return _receiverAudioContext;
}

/**
 * Unlock Foundry audio (user-gesture policy), then ensure our stream context is running.
 * @returns {Promise<void>}
 */
async function ensureReceiverAudioReady() {
	await waitForAudioUnlocked();
	const ctx = getReceiverAudioContext();
	if (ctx.state === "suspended") {
		try {
			await ctx.resume();
		} catch (err) {
			console.warn(`${MODULE_ID} | AudioContext.resume`, err);
		}
	}
}

/**
 * @returns {string}
 */
export function getEffectiveStreamUrl() {
	const follow = Boolean(game.settings.get(MODULE_ID, SETTINGS.followGmStream));
	if (follow) {
		return String(game.settings.get(MODULE_ID, SETTINGS.streamUrl) ?? "").trim();
	}
	return String(game.settings.get(MODULE_ID, SETTINGS.customStreamUrl) ?? "").trim();
}

/**
 * @returns {'http' | 'shout'}
 */
export function getStreamFormat() {
	const fmt = game.settings.get(MODULE_ID, SETTINGS.streamFormat);
	return fmt === STREAM_FORMAT.SHOUT ? STREAM_FORMAT.SHOUT : STREAM_FORMAT.HTTP;
}

function disposeSound() {
	detachMediaListeners();
	if (_sound) {
		try {
			void _sound.stop({ fade: 0 });
		} catch (_) {
			/* ignore */
		}
		_sound = null;
	}
	_loadedSrc = "";
}

/**
 * @returns {number}
 */
function getReceiverVolume() {
	return Math.clamp(Number(game.settings.get(MODULE_ID, SETTINGS.receiverVolume) ?? 1), 0, 1);
}

function receiverGainMultiplier() {
	return getStreamFormat() === STREAM_FORMAT.HTTP ? HTTP_STREAM_GAIN_MULTIPLIER : 1;
}

/**
 * @param {number} setting01 0–1 from setting or slider
 */
function toReceiverGain(setting01) {
	return Math.clamp(Number(setting01) || 0, 0, 1) * receiverGainMultiplier();
}

/**
 * Apply linear volume to the active sound without persisting settings.
 * @param {number} linear01
 */
export function applyLiveVolume(linear01) {
	if (_sound?.gain) {
		_sound.gain.value = toReceiverGain(linear01);
	}
}

/**
 * @returns {Promise<void>}
 */
export async function playStream() {
	const url = getEffectiveStreamUrl();
	if (!url) {
		ui.notifications?.warn(game.i18n.localize(`${MODULE_ID}.notify.noUrl`));
		return;
	}

	clearReconnectTimer();
	_reconnectAttempt = 0;
	_userWantsPlayback = true;
	notifyPanel();
	await enqueuePlayback({ bumpGeneration: true });
}

/**
 * @returns {Promise<void>}
 */
export async function stopStream() {
	_playbackGen++;
	_userWantsPlayback = false;
	clearReconnectTimer();
	_reconnectAttempt = 0;
	if (!_sound) {
		notifyPanel();
		return;
	}
	await _sound.stop({ fade: 0 });
	disposeSound();
	notifyPanel();
}

/**
 * Call when world/user settings that affect playback change.
 */
export function onSettingsAffectingPlayback() {
	const url = getEffectiveStreamUrl();
	const vol = getReceiverVolume();

	if (_sound?.gain) {
		_sound.gain.value = toReceiverGain(vol);
	}

	if (!url) {
		void stopStream();
		notifyPanel();
		return;
	}

	if (_userWantsPlayback) {
		if (!_sound?.playing || _loadedSrc !== url) {
			clearReconnectTimer();
			_reconnectAttempt = 0;
			void enqueuePlayback({ bumpGeneration: true });
		}
	} else if (_loadedSrc && _loadedSrc !== url) {
		disposeSound();
	}
	notifyPanel();
}

/**
 * @returns {{ playing: boolean, reconnecting: boolean, busy: boolean, wantsPlayback: boolean, url: string }}
 */
export function getPlaybackState() {
	const playing = Boolean(_sound?.playing);
	const reconnecting =
		_userWantsPlayback && !playing && Boolean(getEffectiveStreamUrl());
	return {
		playing,
		reconnecting,
		busy: _attemptInFlight,
		wantsPlayback: _userWantsPlayback,
		url: getEffectiveStreamUrl(),
	};
}
