import { MODULE_ID, SETTINGS } from "./constants.js";
import { t } from "./i18n.js";
import { applyLiveVolume } from "./stream-player.js";

const ROW_CLASS = `${MODULE_ID}-global-volume-row`;
/**
 * Native `<input type="range">` only. Avoids Foundry `<range-picker>` (shared with global volume internals,
 * form hooks, `#onChangeInput`, etc.) — that caused cross-talk with Music / Environment / Interface.
 * Never use class `global-volume-slider` on any input here (core hooks it for ClientSettings).
 */
const RECEIVER_VOLUME_INPUT_CLASS = "far-receiver-volume-input";

/**
 * @param {number} linear01
 * @returns {number}
 */
function volumeToSlider(linear01) {
	const AH = globalThis.foundry?.audio?.AudioHelper;
	return AH ? AH.volumeToInput(linear01, 1.5) : Math.clamp(linear01, 0, 1);
}

/**
 * @param {number} sliderValue
 * @returns {number}
 */
function sliderToVolume(sliderValue) {
	const AH = globalThis.foundry?.audio?.AudioHelper;
	return AH
		? AH.inputToVolume(Number(sliderValue), 1.5)
		: Math.clamp(Number(sliderValue), 0, 1);
}

/**
 * @param {HTMLInputElement} volInput
 * @param {number} linear01
 */
function updateNativeVolumeDisplay(volInput, linear01) {
	const pct = Math.round(Math.clamp(linear01, 0, 1) * 100);
	volInput.setAttribute("data-tooltip", `${pct}%`);
	volInput.setAttribute("aria-valuetext", `Volume: ${pct}%`);
}

/**
 * @returns {HTMLInputElement}
 */
function buildNativeVolumeRange() {
	const input = document.createElement("input");
	input.type = "range";
	input.className = RECEIVER_VOLUME_INPUT_CLASS;
	input.min = "0";
	input.max = "1";
	input.step = "0.05";
	input.value = "1";
	input.title = t("panel.streamVolume");
	input.setAttribute("aria-label", t("panel.streamVolume"));
	updateNativeVolumeDisplay(input, 1);
	return input;
}

/**
 * @param {HTMLElement} root Row host: `li` or fallback `div`.
 */
function bindGlobalVolumeRow(root) {
	if (root.dataset.farGlobalVolBound === "1") {
		return;
	}
	const volInput = root.querySelector(`input.${RECEIVER_VOLUME_INPUT_CLASS}`);
	if (!(volInput instanceof HTMLInputElement)) {
		return;
	}
	root.dataset.farGlobalVolBound = "1";

	volInput.addEventListener("input", () => {
		const linear = sliderToVolume(Number(volInput.value));
		if (!Number.isFinite(linear)) {
			return;
		}
		applyLiveVolume(linear);
		updateNativeVolumeDisplay(volInput, linear);
	});
	volInput.addEventListener("change", async () => {
		const linear = sliderToVolume(Number(volInput.value));
		if (!Number.isFinite(linear)) {
			return;
		}
		await game.settings.set(MODULE_ID, SETTINGS.receiverVolume, linear);
		volInput.value = String(volumeToSlider(linear));
		updateNativeVolumeDisplay(volInput, linear);
	});
}

/**
 * @param {HTMLElement} html
 * @returns {HTMLElement}
 */
function findGlobalVolumeHost(html) {
	const firstPicker = html.querySelector("range-picker");
	if (firstPicker) {
		let p = firstPicker.parentElement;
		while (p && p !== html) {
			const n = p.querySelectorAll("range-picker").length;
			if (n >= 3) {
				return p;
			}
			p = p.parentElement;
		}
		const oneUp = firstPicker.parentElement;
		if (oneUp) {
			return oneUp;
		}
	}
	const footer = html.querySelector(
		"footer[data-application-part], footer.application__footer, form > footer",
	);
	if (footer instanceof HTMLElement) {
		return footer;
	}
	const list = html.querySelector(".directory-list, ol.directory-list");
	if (list?.parentElement instanceof HTMLElement) {
		return list.parentElement;
	}
	return html;
}

/**
 * Sync slider from world/user setting (persists across reloads).
 */
export function syncGlobalStreamVolumeRow() {
	const row = document.querySelector(`.${ROW_CLASS}`);
	if (!row) {
		return;
	}
	const vol = Number(game.settings.get(MODULE_ID, SETTINGS.receiverVolume) ?? 1);
	const sliderVal = volumeToSlider(vol);
	const volInput = row.querySelector(`input.${RECEIVER_VOLUME_INPUT_CLASS}`);
	if (volInput instanceof HTMLInputElement) {
		volInput.value = String(sliderVal);
		updateNativeVolumeDisplay(volInput, vol);
	}
}

/**
 * @param {HTMLElement} html
 * @returns {HTMLOListElement | null}
 */
function findGlobalVolumeList(html) {
	const gv = html.querySelector(".global-volume.global-control");
	if (gv) {
		const ol = gv.querySelector("ol.plain");
		if (ol instanceof HTMLOListElement) {
			return ol;
		}
	}
	return null;
}

/**
 * Replace legacy `<range-picker>` from earlier module versions with a plain range (one-time per render).
 * @param {HTMLElement} row
 */
function migrateRowFromRangePickerIfNeeded(row) {
	const oldPicker = row.querySelector("range-picker");
	if (!oldPicker) {
		return;
	}
	row.dataset.farGlobalVolBound = "0";
	const fresh = buildNativeVolumeRange();
	oldPicker.replaceWith(fresh);
}

/**
 * Core global volume rows use a shared label column width (driven by the longest label). Match that so sliders align.
 * @param {HTMLOListElement} ol
 * @returns {number}
 */
function measureCoreGlobalVolumeLabelWidth(ol) {
	let maxW = 0;
	for (const li of ol.querySelectorAll(":scope > li.flexrow")) {
		if (li.classList.contains(ROW_CLASS)) {
			continue;
		}
		const lbl = li.querySelector(":scope > label");
		if (lbl instanceof HTMLLabelElement) {
			const w = lbl.getBoundingClientRect().width;
			if (w > 0) {
				maxW = Math.max(maxW, w);
			}
		}
	}
	return maxW;
}

/**
 * Sets `--far-core-vol-label-width` on our row from live core labels (theme + locale safe).
 */
function syncStreamVolumeLabelWidthFromCore() {
	const ol = document.querySelector(".global-volume.global-control ol.plain");
	if (!(ol instanceof HTMLOListElement)) {
		return;
	}
	const targets = [
		ol.querySelector(`li.${ROW_CLASS}`),
		document.querySelector(`div.${ROW_CLASS}`),
	].filter((n) => n instanceof HTMLElement);
	if (targets.length === 0) {
		return;
	}
	const apply = () => {
		const w = measureCoreGlobalVolumeLabelWidth(ol);
		if (w > 0) {
			for (const row of targets) {
				row.style.setProperty("--far-core-vol-label-width", `${w}px`);
			}
		}
	};
	apply();
	requestAnimationFrame(apply);
}

/**
 * @returns {HTMLLIElement}
 */
function buildStreamVolumeListItem() {
	const li = document.createElement("li");
	li.className = `flexrow ${ROW_CLASS}`;
	li.setAttribute("role", "group");
	li.setAttribute("aria-label", t("panel.globalVolumeGroup"));
	li.dataset.tooltip = `${MODULE_ID}.panel.streamVolumeTooltip`;

	const label = document.createElement("label");
	label.textContent = t("panel.streamVolume");

	const icon = document.createElement("i");
	icon.className = "volume-icon fa-fw fa-solid fa-volume-low";
	icon.setAttribute("inert", "");

	li.append(label, icon, buildNativeVolumeRange());
	return li;
}

/**
 * @param {HTMLElement} html
 */
function ensureGlobalVolumeRow(html) {
	let row = html.querySelector(`.${ROW_CLASS}`);
	if (!row) {
		const ol = findGlobalVolumeList(html);
		if (ol) {
			row = buildStreamVolumeListItem();
			ol.appendChild(row);
		} else {
			const host = findGlobalVolumeHost(html);
			row = document.createElement("div");
			row.className = `flexrow ${ROW_CLASS}`;
			row.setAttribute("role", "group");
			row.setAttribute("aria-label", t("panel.globalVolumeGroup"));
			const lbl = document.createElement("label");
			lbl.className = "far-global-vol-label";
			lbl.textContent = t("panel.streamVolume");
			row.append(lbl, buildNativeVolumeRange());
			host.appendChild(row);
		}
	} else {
		migrateRowFromRangePickerIfNeeded(row);
	}
	bindGlobalVolumeRow(row);
	syncGlobalStreamVolumeRow();
	queueMicrotask(() => syncGlobalStreamVolumeRow());
	syncStreamVolumeLabelWidthFromCore();
}

export function registerGlobalStreamVolumeRow() {
	Hooks.on("renderPlaylistDirectory", (_app, html) => {
		if (!(html instanceof HTMLElement)) {
			return;
		}
		requestAnimationFrame(() => ensureGlobalVolumeRow(html));
	});
}
