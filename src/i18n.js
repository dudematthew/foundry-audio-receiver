import { MODULE_ID } from "./constants.js";

/**
 * @param {string} path Dot path after module id, e.g. "panel.title" or "settings.streamUrl.name"
 * @returns {string}
 * @see https://foundryvtt.com/article/localization/ — keys in `lang/*.json` must match
 *   `game.i18n.localize` lookups (flat namespaced keys like `module-id.settings.foo.name`).
 */
export function t(path) {
	return game.i18n.localize(`${MODULE_ID}.${path}`);
}
