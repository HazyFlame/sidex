/**
 * Overlays the hand-maintained themes in `builtin-themes/` on top of the
 * generated `extensions/` folder.
 *
 * `extensions/` is populated from a VS Code installation or download by
 * `scripts/setup-extensions.sh` (`npm run setup:full`) and
 * `scripts/fetch-language-extensions.mjs` (`npm run setup:languages`), and it is
 * gitignored - anything hand-edited in there is lost on a re-download and never
 * reaches another checkout. SideX's own themes (Light 2026 / Dark 2026, see
 * `builtin-themes/README.md`) therefore live in `builtin-themes/`: this script
 * copies them into `extensions/` and re-registers them in the target
 * extension's manifest, right before `scripts/generate-extension-meta.js` bakes
 * the descriptors into `extensions-meta.json` + `public/builtin-extensions.js`.
 *
 * Idempotent (already registered contributions are left alone) and a no-op with
 * a warning when `extensions/` has not been populated yet, so `npm run setup`
 * still succeeds on a bare checkout.
 *
 * Usage: node scripts/apply-builtin-themes.mjs
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const overlayRoot = path.join(repoRoot, 'builtin-themes');
const extensionsDir = path.join(repoRoot, 'extensions');
const overlayManifestFile = path.join(overlayRoot, 'manifest.json');

function log(message) {
	console.log(`[builtin-themes] ${message}`);
}

function readJson(file) {
	// Manifests have shipped with a UTF-8 BOM before; JSON.parse rejects it.
	return JSON.parse(readFileSync(file, 'utf-8').replace(/^\uFEFF/, ''));
}

function writeJson(file, value) {
	writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function copyTree(source, target) {
	let copied = 0;
	for (const entry of readdirSync(source, { withFileTypes: true })) {
		const from = path.join(source, entry.name);
		const to = path.join(target, entry.name);
		if (entry.isDirectory()) {
			copied += copyTree(from, to);
			continue;
		}
		// Only touch what actually changed, so a second run is a real no-op.
		if (existsSync(to) && readFileSync(from).equals(readFileSync(to))) {
			continue;
		}
		mkdirSync(path.dirname(to), { recursive: true });
		copyFileSync(from, to);
		copied++;
	}
	return copied;
}

/**
 * Prepends contributions that are not registered yet, so the SideX themes stay
 * at the top of their section in the theme picker, and keeps the entries that
 * come from the upstream extension untouched.
 */
function registerContributions(packageJSON, contributions) {
	let registered = 0;
	for (const [key, entries] of Object.entries(contributions)) {
		const existing = Array.isArray(packageJSON.contributes?.[key]) ? packageJSON.contributes[key] : [];
		const known = new Set(existing.map(entry => entry.id));
		const missing = entries.filter(entry => !known.has(entry.id));
		if (!missing.length) {
			continue;
		}
		packageJSON.contributes = { ...packageJSON.contributes, [key]: [...missing, ...existing] };
		registered += missing.length;
	}
	return registered;
}

function mergeNls(packageNLS, values) {
	let merged = 0;
	for (const [key, value] of Object.entries(values)) {
		if (packageNLS[key] !== value) {
			packageNLS[key] = value;
			merged++;
		}
	}
	return merged;
}

export function applyBuiltinThemeOverlay() {
	const summary = { applied: false, files: 0, themes: 0, nls: 0, skipped: [] };

	if (!existsSync(overlayManifestFile)) {
		return summary;
	}
	if (!existsSync(extensionsDir) || readdirSync(extensionsDir).length === 0) {
		log('extensions/ is empty - run "npm run setup:full" first, nothing to overlay');
		return summary;
	}
	summary.applied = true;

	const { extensions = {} } = readJson(overlayManifestFile);

	for (const [name, overlay] of Object.entries(extensions)) {
		const extensionDir = path.join(extensionsDir, name);
		if (!existsSync(path.join(extensionDir, 'package.json'))) {
			// Not part of this checkout: nothing to overlay onto.
			summary.skipped.push(name);
			continue;
		}

		const overlayExtensionDir = path.join(overlayRoot, name);
		const files = existsSync(overlayExtensionDir) ? copyTree(overlayExtensionDir, extensionDir) : 0;
		summary.files += files;

		const packageJSONFile = path.join(extensionDir, 'package.json');
		const packageJSON = readJson(packageJSONFile);
		const themes = registerContributions(packageJSON, overlay.contributes ?? {});
		if (themes) {
			writeJson(packageJSONFile, packageJSON);
			summary.themes += themes;
		}

		if (overlay.nls) {
			const nlsFile = path.join(extensionDir, 'package.nls.json');
			const packageNLS = existsSync(nlsFile) ? readJson(nlsFile) : {};
			const merged = mergeNls(packageNLS, overlay.nls);
			if (merged) {
				writeJson(nlsFile, packageNLS);
				summary.nls += merged;
			}
		}

		if (files || themes) {
			log(`${name}: ${files} file(s), ${themes} theme(s) registered`);
		}
	}

	if (summary.skipped.length) {
		log(`skipped (not installed): ${summary.skipped.join(', ')}`);
	}
	return summary;
}

if (import.meta.main) {
	const summary = applyBuiltinThemeOverlay();
	if (summary.applied && !summary.files && !summary.themes) {
		log('nothing to do - builtin-themes/ is already applied');
	}
}
