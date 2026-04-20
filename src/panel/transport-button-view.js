/**
 * @param {HTMLButtonElement} playBtn
 * @param {HTMLElement | null | undefined} playIcon
 * @param {{ cancelMode: boolean; disabled: boolean; labelKey: string; iconClass: string }} spec
 * @param {(key: string) => string} t
 */
function applyPlayPresentation(playBtn, playIcon, spec, t) {
	const label = t(spec.labelKey);
	if (spec.cancelMode) {
		playBtn.classList.add("far-play-cancel");
	} else {
		playBtn.classList.remove("far-play-cancel");
	}
	playBtn.title = label;
	playBtn.setAttribute("aria-label", label);
	playBtn.disabled = spec.disabled;
	if (playIcon) {
		playIcon.className = spec.iconClass;
	}
}

/**
 * @param {HTMLButtonElement} stopBtn
 * @param {HTMLElement | null | undefined} stopIcon
 * @param {{ connecting: boolean; disabled: boolean; labelKey: string; iconClass: string }} spec
 * @param {(key: string) => string} t
 */
function applyStopPresentation(stopBtn, stopIcon, spec, t) {
	const label = t(spec.labelKey);
	if (spec.connecting) {
		stopBtn.classList.add("far-stop-connecting");
		stopBtn.setAttribute("aria-busy", "true");
	} else {
		stopBtn.classList.remove("far-stop-connecting");
		stopBtn.removeAttribute("aria-busy");
	}
	stopBtn.title = label;
	stopBtn.setAttribute("aria-label", label);
	stopBtn.disabled = spec.disabled;
	if (stopIcon) {
		stopIcon.className = spec.iconClass;
	}
}

/**
 * @param {HTMLElement} root
 * @param {{ waitingForStream: boolean; playing: boolean; hasUrl: boolean }} ctx
 * @param {(key: string) => string} t
 */
export function syncTransportButtons(root, ctx, t) {
	const playBtn = root.querySelector('button[name="far-play"]');
	const stopBtn = root.querySelector('button[name="far-stop"]');
	const playIcon = playBtn?.querySelector("i");
	const stopIcon = stopBtn?.querySelector("i");

	if (playBtn instanceof HTMLButtonElement) {
		if (ctx.waitingForStream) {
			applyPlayPresentation(
				playBtn,
				playIcon,
				{
					cancelMode: true,
					disabled: false,
					labelKey: "panel.cancelConnect",
					iconClass: "fas fa-times",
				},
				t,
			);
		} else {
			applyPlayPresentation(
				playBtn,
				playIcon,
				{
					cancelMode: false,
					disabled: ctx.playing || !ctx.hasUrl,
					labelKey: "panel.play",
					iconClass: "fas fa-play",
				},
				t,
			);
		}
	}

	if (stopBtn instanceof HTMLButtonElement) {
		if (ctx.waitingForStream) {
			applyStopPresentation(
				stopBtn,
				stopIcon,
				{
					connecting: true,
					disabled: true,
					labelKey: "panel.connecting",
					iconClass: "fas fa-spinner fa-spin",
				},
				t,
			);
		} else {
			applyStopPresentation(
				stopBtn,
				stopIcon,
				{
					connecting: false,
					disabled: !ctx.playing,
					labelKey: "panel.stop",
					iconClass: "fas fa-stop",
				},
				t,
			);
		}
	}
}
