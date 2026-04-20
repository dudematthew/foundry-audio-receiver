import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";
import Handlebars from "handlebars";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const hbsPath = path.join(root, "templates", "audio-receiver-panel.hbs");
const outPath = path.join(root, "src", "generated", "render-audio-receiver-panel.js");

const hbs = fs.readFileSync(hbsPath, "utf8");
const spec = Handlebars.precompile(hbs);
const entryContents = `import Handlebars from "handlebars/runtime";
export const renderAudioReceiverPanelShell = Handlebars.template(${spec});
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
await esbuild.build({
	stdin: {
		contents: entryContents,
		resolveDir: root,
		sourcefile: "hbs-bridge.mjs",
	},
	outfile: outPath,
	bundle: true,
	format: "esm",
	platform: "browser",
});
console.log("Wrote", outPath, `(${(fs.statSync(outPath).size / 1024).toFixed(1)} KiB)`);
