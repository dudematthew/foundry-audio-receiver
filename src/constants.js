/** @type {const} */
export const MODULE_ID = "foundry-audio-receiver";

/** World + user setting keys */
export const SETTINGS = {
	streamUrl: "streamUrl",
	/** @type {'http' | 'shout'} Placeholder: same playback path today; SHOUT may need headers/metadata later */
	streamFormat: "streamFormat",
	followGmStream: "followGmStream",
	customStreamUrl: "customStreamUrl",
	receiverVolume: "receiverVolume",
	/** User: start the stream automatically after the game loads (if a URL is set). */
	autoPlayOnReady: "autoPlayOnReady",
};

/** @type {const} */
export const STREAM_FORMAT = {
	HTTP: "http",
	SHOUT: "shout",
};

/**
 * Extra Web Audio gain for **HTTP** streams only (e.g. SWYH tends to be quiet). SHOUT uses 1×.
 */
export const HTTP_STREAM_GAIN_MULTIPLIER = 2;
