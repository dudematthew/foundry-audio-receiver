import { MODULE_ID, SETTINGS } from "./constants.js";
import { registerGlobalStreamVolumeRow } from "./playlist-global-volume.js";
import { registerPlaylistsPanel } from "./playlists-panel.js";
import { registerModuleSettings } from "./settings.js";
import {
	getEffectiveStreamUrl,
	onSettingsAffectingPlayback,
	playStream,
	stopStream,
} from "./stream-player.js";

Hooks.once("init", () => {
	registerModuleSettings();
	registerGlobalStreamVolumeRow();
	registerPlaylistsPanel();

	const mod = game.modules.get(MODULE_ID);
	if (mod) {
		mod.api = {
			getEffectiveStreamUrl,
			playStream,
			stopStream,
			onSettingsAffectingPlayback,
		};
	}
});

Hooks.once("ready", async () => {
	onSettingsAffectingPlayback();

	const autoPlay = game.settings.get(MODULE_ID, SETTINGS.autoPlayOnReady);
	if (autoPlay !== false && getEffectiveStreamUrl()) {
		await playStream();
	}
});
