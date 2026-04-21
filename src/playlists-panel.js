import { MODULE_ID, SETTINGS } from "./constants.js";
import { renderAudioReceiverPanelShell } from "./generated/render-audio-receiver-panel.js";
import { getAudioReceiverPanelShellContext } from "./panel/audio-receiver-panel-context.js";
import { syncTransportButtons } from "./panel/transport-button-view.js";
import { syncGlobalStreamVolumeRow } from "./playlist-global-volume.js";
import { t } from "./i18n.js";
import {
	getEffectiveStreamUrl,
	onSettingsAffectingPlayback,
	playStream,
	setPanelRefreshCallback,
	stopStream,
	getPlaybackState,
} from "./stream-player.js";

const PANEL_ID = `${MODULE_ID}-playlist-panel`;

/**
 * @param {HTMLElement} root
 */
function syncPanelState(root) {
	const useGlobal = Boolean(game.settings.get(MODULE_ID, SETTINGS.followGmStream));
	const customUrl = String(game.settings.get(MODULE_ID, SETTINGS.customStreamUrl) ?? "");
	const { playing, reconnecting, busy, showSlowFetchHint } = getPlaybackState();
	const waitingForStream = reconnecting || busy;

	const globalEl = root.querySelector('input[name="far-use-global-stream"]');
	if (globalEl instanceof HTMLInputElement) {
		globalEl.checked = useGlobal;
	}

	const customWrap = root.querySelector(".far-custom-url-wrap");
	const customInput = root.querySelector('input[name="far-custom-url"]');
	if (customWrap instanceof HTMLElement) {
		customWrap.style.display = useGlobal ? "none" : "";
	}
	if (customInput instanceof HTMLInputElement) {
		customInput.value = customUrl;
		customInput.disabled = useGlobal;
	}

	syncTransportButtons(
		root,
		{
			waitingForStream,
			playing,
			hasUrl: Boolean(getEffectiveStreamUrl()),
		},
		t,
	);

	const hintEl = root.querySelector(".far-slow-fetch-hint");
	if (hintEl instanceof HTMLElement) {
		if (showSlowFetchHint) {
			hintEl.hidden = false;
			hintEl.textContent = t("panel.slowFetchHint");
		} else {
			hintEl.hidden = true;
			hintEl.textContent = "";
		}
	}
}

/**
 * @param {HTMLElement} root
 */
function bindPanel(root) {
	if (root.dataset.farBound === "1") {
		return;
	}
	root.dataset.farBound = "1";

	root.querySelector('button[name="far-play"]')?.addEventListener("click", async () => {
		const { playing, reconnecting, busy } = getPlaybackState();
		const waitingForStream = reconnecting || busy;
		if (waitingForStream) {
			await stopStream();
		} else if (!playing) {
			await playStream();
		}
		syncPanelState(root);
		syncGlobalStreamVolumeRow();
	});

	root.querySelector('button[name="far-stop"]')?.addEventListener("click", async () => {
		await stopStream();
		syncPanelState(root);
		syncGlobalStreamVolumeRow();
	});

	const globalEl = root.querySelector('input[name="far-use-global-stream"]');
	if (globalEl instanceof HTMLInputElement) {
		globalEl.addEventListener("change", async () => {
			await game.settings.set(MODULE_ID, SETTINGS.followGmStream, globalEl.checked);
			syncPanelState(root);
			onSettingsAffectingPlayback();
			syncGlobalStreamVolumeRow();
		});
	}

	const customInput = root.querySelector('input[name="far-custom-url"]');
	if (customInput instanceof HTMLInputElement) {
		customInput.addEventListener("change", async () => {
			await game.settings.set(MODULE_ID, SETTINGS.customStreamUrl, customInput.value.trim());
			onSettingsAffectingPlayback();
			syncPanelState(root);
			syncGlobalStreamVolumeRow();
		});
	}

	const header = root.querySelector(".far-audio-receiver-header");
	const expandIcon = header?.querySelector(".expand");
	function toggleReceiverSectionExpanded() {
		root.classList.toggle("expanded");
		const open = root.classList.contains("expanded");
		header?.setAttribute("aria-expanded", String(open));
		if (expandIcon) {
			expandIcon.className = open ? "expand fa-solid fa-angle-down" : "expand fa-solid fa-angle-up";
			expandIcon.setAttribute("inert", "");
		}
	}
	header?.addEventListener("click", (e) => {
		e.preventDefault();
		e.stopPropagation();
		toggleReceiverSectionExpanded();
	});
	header?.addEventListener("keydown", (e) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			e.stopPropagation();
			toggleReceiverSectionExpanded();
		}
	});
}

/**
 * @returns {HTMLElement}
 */
function buildPanel() {
	const root = document.createElement("div");
	root.id = PANEL_ID;
	root.className = "global-control far-playlist-panel expanded";
	root.setAttribute("aria-label", t("panel.ariaLabel"));
	root.innerHTML = renderAudioReceiverPanelShell(getAudioReceiverPanelShellContext());
	return root;
}

/**
 * @param {HTMLElement} html
 * @param {HTMLElement} root
 */
function mountPanelInSidebar(html, root) {
	const globalVol = html.querySelector(".global-volume.global-control");
	const parent = globalVol?.parentElement;
	if (parent instanceof HTMLElement) {
		const needsMove = root.parentElement !== parent || root.nextElementSibling !== globalVol;
		if (needsMove) {
			parent.insertBefore(root, globalVol);
		}
	} else if (root.parentElement !== html) {
		html.insertAdjacentElement("afterbegin", root);
	}
}

export function registerPlaylistsPanel() {
	setPanelRefreshCallback(() => {
		const el = document.getElementById(PANEL_ID);
		if (el) {
			syncPanelState(el);
		}
		syncGlobalStreamVolumeRow();
	});

	Hooks.on("renderPlaylistDirectory", (_app, html) => {
		if (!(html instanceof HTMLElement)) {
			return;
		}
		let root = html.querySelector(`#${PANEL_ID}`);
		if (!root) {
			root = buildPanel();
			bindPanel(root);
		} else {
			bindPanel(root);
		}
		mountPanelInSidebar(html, root);
		syncPanelState(root);
		syncGlobalStreamVolumeRow();
	});
}
