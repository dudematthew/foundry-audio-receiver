
const gulp = require('gulp');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const archiver = require('archiver');
const stringify = require('json-stringify-pretty-compact');
const XMLHttpRequest = require('xhr2');

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

exports.build = gulp.series(clean, buildLess, compilePanelHandlebars);
exports.buildLess = buildLess;
exports.compilePanelHandlebars = compilePanelHandlebars;
exports.clean = clean;
exports.link = linkUserData;
exports.package = gulp.series(exports.build, packageBuild);
// NOTE: Release automation is intentionally not included in this boilerplate.
// Use your preferred GitHub/GitLab CI to publish zips and update manifest URLs.