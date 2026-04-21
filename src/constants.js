/** @type {const} */
export const MODULE_ID = "foundry-audio-receiver";

/** World + user setting keys */
export const SETTINGS = {
	streamUrl: "streamUrl",
	/** World: multiplies the Stream volume slider (Web Audio gain). Default matches former HTTP ×2 behaviour. */
	streamGainMultiplier: "streamGainMultiplier",
	followGmStream: "followGmStream",
	customStreamUrl: "customStreamUrl",
	receiverVolume: "receiverVolume",
	/** User: start the stream automatically after the game loads (if a URL is set). */
	autoPlayOnReady: "autoPlayOnReady",
};

/** Default world gain multiplier when the setting is missing (matches old fixed ×2 boost). */
export const DEFAULT_STREAM_GAIN_MULTIPLIER = 2;

/** Clamp for `streamGainMultiplier` world setting. */
export const STREAM_GAIN_MULTIPLIER_RANGE = {
	min: 0.25,
	max: 4,
	step: 0.25,
};

/** After this many ms stuck loading, show orange hint (source may be silent, not unreachable). */
export const SLOW_FETCH_HINT_MS = 10_000;
