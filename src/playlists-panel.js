import { MODULE_ID, SETTINGS } from "./constants.js";
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
	const { playing, reconnecting, busy } = getPlaybackState();
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

	const playBtn = root.querySelector('button[name="far-play"]');
	const stopBtn = root.querySelector('button[name="far-stop"]');
	const playIcon = playBtn?.querySelector("i");
	const stopIcon = stopBtn?.querySelector("i");

	if (playBtn instanceof HTMLButtonElement) {
		if (waitingForStream) {
			playBtn.classList.add("far-play-cancel");
			playBtn.title = t("panel.cancelConnect");
			playBtn.setAttribute("aria-label", t("panel.cancelConnect"));
			playBtn.disabled = false;
			if (playIcon) {
				playIcon.className = "fas fa-times";
			}
		} else {
			playBtn.classList.remove("far-play-cancel");
			playBtn.title = t("panel.play");
			playBtn.setAttribute("aria-label", t("panel.play"));
			if (playIcon) {
				playIcon.className = "fas fa-play";
			}
			playBtn.disabled = playing || !getEffectiveStreamUrl();
		}
	}

	if (stopBtn instanceof HTMLButtonElement) {
		if (waitingForStream) {
			stopBtn.disabled = true;
			stopBtn.classList.add("far-stop-connecting");
			stopBtn.title = t("panel.connecting");
			stopBtn.setAttribute("aria-label", t("panel.connecting"));
			stopBtn.setAttribute("aria-busy", "true");
			if (stopIcon) {
				stopIcon.className = "fas fa-spinner fa-spin";
			}
		} else {
			stopBtn.classList.remove("far-stop-connecting");
			stopBtn.removeAttribute("aria-busy");
			const canStop = playing;
			stopBtn.disabled = !canStop;
			stopBtn.title = t("panel.stop");
			stopBtn.setAttribute("aria-label", t("panel.stop"));
			if (stopIcon) {
				stopIcon.className = "fas fa-stop";
			}
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
			expandIcon.className = open ? "expand fa-solid fa-angle-up" : "expand fa-solid fa-angle-down";
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
	root.innerHTML = `
  <header class="far-audio-receiver-header" role="button" tabindex="0" aria-expanded="true" aria-label="${t("panel.expandSection")}">
    <i class="expand fa-solid fa-angle-up" inert=""></i>
    <strong>${t("panel.title")}</strong>
  </header>
  <div class="expandable">
    <div class="wrapper">
      <div class="far-playlist-controls">
        <button type="button" name="far-play" class="far-icon-btn" title="${t("panel.play")}" aria-label="${t("panel.play")}">
          <i class="fas fa-play"></i>
        </button>
        <button type="button" name="far-stop" class="far-icon-btn" title="${t("panel.stop")}" aria-label="${t("panel.stop")}">
          <i class="fas fa-stop"></i>
        </button>
      </div>
      <div class="far-playlist-options">
        <label class="far-follow-label">
          <input type="checkbox" name="far-use-global-stream" checked />
          <span>${t("panel.useGlobalStream")}</span>
        </label>
        <div class="far-custom-url-wrap">
          <input type="url" name="far-custom-url" class="far-custom-url" placeholder="${t("panel.customUrlPlaceholder")}" />
        </div>
      </div>
    </div>
  </div>
`;
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
