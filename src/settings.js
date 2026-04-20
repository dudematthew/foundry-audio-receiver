import { MODULE_ID, SETTINGS, STREAM_FORMAT } from "./constants.js";
import { t } from "./i18n.js";
import { onSettingsAffectingPlayback } from "./stream-player.js";

export function registerModuleSettings() {
	game.settings.register(MODULE_ID, SETTINGS.streamUrl, {
		name: t("settings.streamUrl.name"),
		hint: t("settings.streamUrl.hint"),
		scope: "world",
		config: true,
		type: String,
		default: "",
		onChange: () => onSettingsAffectingPlayback(),
	});

	game.settings.register(MODULE_ID, SETTINGS.streamFormat, {
		name: t("settings.streamFormat.name"),
		hint: t("settings.streamFormat.hint"),
		scope: "world",
		config: true,
		type: String,
		choices: {
			[STREAM_FORMAT.HTTP]: t("settings.streamFormat.http"),
			[STREAM_FORMAT.SHOUT]: t("settings.streamFormat.shout"),
		},
		default: STREAM_FORMAT.HTTP,
		onChange: () => onSettingsAffectingPlayback(),
	});

	game.settings.register(MODULE_ID, SETTINGS.followGmStream, {
		name: t("settings.followGmStream.name"),
		hint: t("settings.followGmStream.hint"),
		scope: "user",
		config: true,
		type: Boolean,
		default: true,
		onChange: () => onSettingsAffectingPlayback(),
	});

	game.settings.register(MODULE_ID, SETTINGS.autoPlayOnReady, {
		name: t("settings.autoPlayOnReady.name"),
		hint: t("settings.autoPlayOnReady.hint"),
		scope: "user",
		config: true,
		type: Boolean,
		default: true,
		onChange: () => {},
	});

	game.settings.register(MODULE_ID, SETTINGS.customStreamUrl, {
		name: t("settings.customStreamUrl.name"),
		hint: t("settings.customStreamUrl.hint"),
		scope: "user",
		config: true,
		type: String,
		default: "",
		onChange: () => onSettingsAffectingPlayback(),
	});

	game.settings.register(MODULE_ID, SETTINGS.receiverVolume, {
		name: t("settings.receiverVolume.name"),
		hint: t("settings.receiverVolume.hint"),
		scope: "user",
		config: false,
		type: Number,
		range: {
			min: 0,
			max: 1,
			step: 0.05,
		},
		default: 1,
		onChange: () => onSettingsAffectingPlayback(),
	});
}
