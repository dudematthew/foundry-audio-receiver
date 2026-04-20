import { t } from "../i18n.js";

/**
 * @returns {Record<string, string>}
 */
export function getAudioReceiverPanelShellContext() {
	return {
		expandSectionAria: t("panel.expandSection"),
		title: t("panel.title"),
		playTitle: t("panel.play"),
		playAria: t("panel.play"),
		stopTitle: t("panel.stop"),
		stopAria: t("panel.stop"),
		useGlobalStream: t("panel.useGlobalStream"),
		customUrlPlaceholder: t("panel.customUrlPlaceholder"),
	};
}
