
const gulp = require('gulp');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const archiver = require('archiver');
const stringify = require('json-stringify-pretty-compact');

const less = require('gulp-less');

const argv = require('yargs').argv;
const { execSync } = require('child_process');

/**
 * Base config from foundryconfig.json, overridden by optional foundryconfig.local.json (gitignored).
 */
function getFoundryConfig() {
	const basePath = path.resolve('.', 'foundryconfig.json');
	const localPath = path.resolve('.', 'foundryconfig.local.json');
	const base = fs.readJSONSync(basePath);
	if (fs.existsSync(localPath)) {
		return { ...base, ...fs.readJSONSync(localPath) };
	}
	return base;
}

function getManifest() {
	const json = { root: 'src' };

	const modulePath = path.join(json.root, 'module.json');
	const systemPath = path.join(json.root, 'system.json');

	if (fs.existsSync(modulePath)) {
		json.file = fs.readJSONSync(modulePath);
		json.name = 'module.json';
	} else if (fs.existsSync(systemPath)) {
		json.file = fs.readJSONSync(systemPath);
		json.name = 'system.json';
	} else {
		return;
	}

	return json;
}

function parseRepoSlug(repository) {
	// Accept:
	// - "owner/repo"
	// - "https://github.com/owner/repo"
	// - "git@github.com:owner/repo.git"
	if (!repository || typeof repository !== "string") return null;

	const trimmed = repository.trim();
	if (!trimmed) return null;

	// owner/repo
	const slugMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
	if (slugMatch) return `${slugMatch[1]}/${slugMatch[2]}`;

	// https://github.com/owner/repo(.git)?
	const httpsMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/i);
	if (httpsMatch) return httpsMatch[1];

	// git@github.com:owner/repo(.git)?
	const sshMatch = trimmed.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i);
	if (sshMatch) return sshMatch[1];

	return null;
}

function bumpSemver(version, bump) {
	const m = String(version ?? "").trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
	if (!m) throw new Error(`Invalid version "${version}" (expected x.y.z)`);
	let [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];

	switch (bump) {
		case "major":
			major += 1; minor = 0; patch = 0; break;
		case "minor":
			minor += 1; patch = 0; break;
		case "patch":
		default:
			patch += 1; break;
	}
	return `${major}.${minor}.${patch}`;
}

function gitTagExists(tag) {
	try {
		const out = execSync(`git tag --list "${tag}"`, { cwd: __dirname, stdio: ["ignore", "pipe", "ignore"] })
			.toString("utf8")
			.trim();
		return out === tag;
	} catch {
		return false;
	}
}

/********************/
/*		BUILD		*/
/********************/

/**
 * Build Less
 */
function buildLess() {
	return gulp.
		src('src/styles/*.less')
		.pipe(less())
		.pipe(gulp.dest('src/'));
}

/**
 * Precompile `templates/audio-receiver-panel.hbs` and bundle Handlebars runtime (esbuild) into
 * `src/generated/render-audio-receiver-panel.js` for Foundry ESM import (no node_modules in zip).
 */
function compilePanelHandlebars(done) {
	try {
		execSync('node scripts/compile-panel-hbs.mjs', { cwd: __dirname, stdio: 'inherit' });
		done();
	} catch (e) {
		done(e);
	}
}

/********************/
/*		CLEAN		*/
/********************/

/**
 * Remove built files from `src` folder
 * while ignoring source files
 */
async function clean() {
	const manifest = getManifest();
	const name = manifest?.file?.id;
	const files = [];

	if (!name) {
		console.warn(chalk.yellow("No manifest found in src/. Nothing to clean."));
		return;
	}

	// If the project uses Less
	if (fs.existsSync(path.join('src', 'styles', `${name}.less`))) {
		files.push('fonts', `${name}.css`);
	}

	console.log(' ', chalk.yellow('Files to clean:'));
	console.log('   ', chalk.blueBright(files.join('\n    ')));

	// Attempt to remove the files
	try {
		for (const filePath of files) {
			await fs.remove(path.join('src', filePath));
		}
		return Promise.resolve();
	} catch (err) {
		Promise.reject(err);
	}
}

/********************/
/*		LINK		*/
/********************/

/**
 * Link build to User Data folder
 */
async function linkOrCopyDir(srcDir, destDir) {
	// Prefer symlink (junction for Windows directories). If that fails (e.g. virtual drives),
	// fall back to a real copy so Foundry can still load the module.
	try {
		console.log(chalk.green(`Linking build to ${chalk.blueBright(destDir)}`));
		await fs.symlink(srcDir, destDir, 'junction');
		return;
	} catch (err) {
		const code = err && (err.code || err.errno);
		console.warn(
			chalk.yellow(
				`Symlink failed (${code ?? 'unknown'}). Falling back to copy into ${chalk.blueBright(destDir)}`
			)
		);
		// In case a partially-created link/dir exists
		try { await fs.remove(destDir); } catch (_) { /* ignore */ }
		await fs.copy(srcDir, destDir, { overwrite: true, errorOnExist: false });
	}
}

async function linkUserData() {
	const config = getFoundryConfig();

	let destDir, name;
	try {
		const sourceModulePath = path.resolve('.', 'src', 'module.json');
		if (fs.existsSync(sourceModulePath)) {
			destDir = 'modules';
            name = fs.readJSONSync(sourceModulePath).id;
		} else {
			throw Error(
				`Could not find ${chalk.blueBright(
					'module.json'
				)} or ${chalk.blueBright('system.json')}`
			);
		}

		let linkDir;
		if (config.dataPath) {
			let appDataPath = process.env.AppData;
			let resolvedDataPath;
			if (!appDataPath) {
				console.warn(chalk.yellow("Can't auto-resolve data path, set an absolute path in foundryconfig.json (or foundryconfig.local.json) > dataPath."));
				resolvedDataPath = config.dataPath;
			} else {
				let localAppDataPath = appDataPath.replace("Roaming", "Local");
				resolvedDataPath = config.dataPath.replace("${env:AppData}", localAppDataPath);
			}
			if (!fs.existsSync(path.join(resolvedDataPath, 'Data')))
				throw Error('User Data path invalid, no Data directory found at ' + resolvedDataPath);

			linkDir = path.join(resolvedDataPath, 'Data', destDir, name);
		} else {
			throw Error('No User Data path defined in foundryconfig.json / foundryconfig.local.json');
		}

		if (argv.clean || argv.c) {
			console.log(
				chalk.yellow(`Removing build in ${chalk.blueBright(linkDir)}`)
			);

			await fs.remove(linkDir);
		} else {
			// Always replace the target module directory so changes propagate even when the folder already exists.
			// This is safe because linkDir should point at the Foundry User Data module folder for this module id.
			if (fs.existsSync(linkDir)) {
				console.log(
					chalk.yellow(`Replacing existing build in ${chalk.blueBright(linkDir)}`)
				);
				await fs.remove(linkDir);
			}
			await linkOrCopyDir(path.resolve('./src'), linkDir);
		}
		return Promise.resolve();
	} catch (err) {
		Promise.reject(err);
	}
}

/*********************/
/*		PACKAGE		 */
/*********************/

/**
 * Package build
 */
async function packageBuild() {
	const manifest = getManifest();

	return new Promise((resolve, reject) => {
		try {
			// Remove the package dir without doing anything else
			if (argv.clean || argv.c) {
				console.log(chalk.yellow('Removing all packaged files'));
				fs.removeSync('package');
				return;
			}

			// Ensure there is a directory to hold all the packaged versions
			fs.ensureDirSync('package');

			// Initialize the zip file
            const zipName = `${manifest.file.id}-v${manifest.file.version}.zip`;
			const zipFile = fs.createWriteStream(path.join('package', zipName));
			const zip = archiver('zip', { zlib: { level: 9 } });

			zipFile.on('close', () => {
				console.log(chalk.green(zip.pointer() + ' total bytes'));
				console.log(
					chalk.green(`Zip file ${zipName} has been written`)
				);
				return resolve();
			});

			zip.on('error', (err) => {
				throw err;
			});

			zip.pipe(zipFile);

			// Add the directory with the final code
            zip.directory('src/', manifest.file.id);

			zip.finalize();
		} catch (err) {
			return reject(err);
		}
	});
}

/**
 * Bump version in `src/module.json` (and `package.json`) and optionally update
 * Foundry manifest URLs for GitHub Releases.
 *
 * Usage:
 * - gulp createVersion --bump patch|minor|major
 * - gulp createVersion --version 0.1.0
 *
 * Notes:
 * - If `foundryconfig.json` (or `.local`) has `repository` set to a GitHub repo,
 *   we write:
 *   - module.json.manifest  = raw tag URL to src/module.json
 *   - module.json.download  = GitHub release asset URL for the packaged zip
 * - Always creates a git tag `vX.Y.Z` (no push).
 */
async function createVersion() {
	const manifest = getManifest();
	if (!manifest?.file?.id) throw new Error("Could not load src/module.json (missing id).");
	if (!manifest?.file?.version) throw new Error("Could not load src/module.json (missing version).");

	const cfg = getFoundryConfig();
	const repoSlug = parseRepoSlug(cfg?.repository);

	const explicitVersion = argv.version || argv.v;
	const bump = (argv.bump || argv.b || "patch").toString().toLowerCase();
	const nextVersion = explicitVersion ? String(explicitVersion).trim() : bumpSemver(manifest.file.version, bump);

	if (!/^\d+\.\d+\.\d+$/.test(nextVersion)) {
		throw new Error(`Invalid --version "${nextVersion}" (expected x.y.z)`);
	}

	const versionTag = `v${nextVersion}`;
	if (gitTagExists(versionTag)) {
		throw new Error(`Git tag "${versionTag}" already exists.`);
	}

	console.log(chalk.cyan(`Bumping version → ${versionTag}`));

	// Update module.json
	manifest.file.version = nextVersion;
	if (repoSlug) {
		const zipName = `${manifest.file.id}-v${nextVersion}.zip`;
		manifest.file.manifest = `https://raw.githubusercontent.com/${repoSlug}/${versionTag}/${manifest.root}/${manifest.name}`;
		manifest.file.download = `https://github.com/${repoSlug}/releases/download/${versionTag}/${zipName}`;
	} else {
		console.log(
			chalk.yellow(
				`foundryconfig.json.repository is empty/invalid; leaving module.json manifest/download unchanged.`
			)
		);
	}

	const manifestFilePath = path.join(manifest.root, manifest.name);
	fs.writeFileSync(manifestFilePath, stringify(manifest.file, { indent: 4 }), "utf8");

	// Keep package.json version in sync if present
	const packageJsonPath = path.resolve(".", "package.json");
	if (fs.existsSync(packageJsonPath)) {
		const pkg = fs.readJSONSync(packageJsonPath);
		if (pkg && typeof pkg === "object") {
			pkg.version = nextVersion;
			fs.writeFileSync(packageJsonPath, stringify(pkg, { indent: 2 }), "utf8");
		}
	}

	// Create local git tag
	execSync(`git tag ${versionTag}`, { cwd: __dirname, stdio: "inherit" });
}

exports.build = gulp.series(clean, buildLess, compilePanelHandlebars);
exports.buildLess = buildLess;
exports.compilePanelHandlebars = compilePanelHandlebars;
exports.clean = clean;
exports.link = linkUserData;
exports.package = gulp.series(exports.build, packageBuild);
exports.createVersion = createVersion;
// release = bump version + build/package. (No uploading/publishing yet.)
exports.release = gulp.series(createVersion, exports.package);