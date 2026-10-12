/**
 * Downloads the built-in language extensions that SideX ships with, into
 * `extensions/` (gitignored). Nothing here is committed: `npm run setup`
 * regenerates `extensions-meta.json` + `public/builtin-extensions.js` from the
 * populated folder, and `scripts/postbuild.js` copies it into `dist/extensions`
 * where the workbench loads it from (`builtinExtensionsPath` in
 * `src/vs/base/common/network.ts`).
 *
 * Why extensions: SideX takes language ids, TextMate grammars and
 * language-configurations from extension contributions (`contributes.languages`,
 * `contributes.grammars`), exactly like VS Code - there is no grammar in core.
 * With an empty `extensions/` folder every file renders as plain text.
 *
 * Sources:
 *  - java, groovy (+ the html/css/scss/less/javascript/typescript/json grammars
 *    that the Vue grammar includes) come from the VS Code source tree.
 *  - vue comes from Vetur (MIT, https://github.com/octref/vetur).
 *
 * Usage: node scripts/fetch-language-extensions.mjs [--force]
 */
import { spawnSync } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const VSCODE_VERSION = '1.115.0';
const VSCODE_EXTENSIONS = [
	'java',
	'groovy',
	// Dependencies of the Vue grammar (source.css, source.js, source.ts, ...) and
	// the languages a Vue SFC embeds via `<style lang="...">` / `<script lang="...">`.
	'html',
	'css',
	'scss',
	'less',
	'javascript',
	'typescript-basics',
	'json',
	// The workbench resolves its default theme ("Dark Modern", see
	// ThemeSettingDefaults.COLOR_THEME_DARK) from this extension. Without it the
	// theme service falls back to a theme with no `tokenColors`, so every token
	// renders in the default foreground colour (code looks like plain text).
	'theme-defaults',
	// File icons for the explorer/editor tabs ("Seti").
	'theme-seti'
];

// Directories/files that are build-time only for the extensions above.
const PRUNE_NAMES = new Set([
	'build',
	'node_modules',
	'src',
	'test',
	'tests',
	'out',
	'.vscode',
	'.github',
	'.vscodeignore',
	'cgmanifest.json',
	'.gitignore',
	'tsconfig.json',
	'yarn.lock'
]);

const VETUR_REPO = 'octref/vetur';
const VETUR_REF = 'refs/heads/master';
const VETUR_FILES = [
	'syntaxes/vue-generated.json', // contributes `source.vue`
	'syntaxes/vue-html.tmLanguage.json', // contributes `text.html.vue-html`
	'syntaxes/vue-postcss.json',
	'syntaxes/vue-sugarss.json',
	'languages/vue-language-configuration.json',
	'languages/vue-html-language-configuration.json',
	'languages/vue-postcss-language-configuration.json',
	'languages/vue-sugarss-language-configuration.json'
];

const force = process.argv.includes('--force');
const repoRoot = path.resolve(import.meta.dirname, '..');
const extensionsDir = path.join(repoRoot, 'extensions');

function log(msg) {
	console.log(`[languages] ${msg}`);
}

function requireTar() {
	const probe = spawnSync('tar', ['--version'], { stdio: 'ignore' });
	if (probe.error || probe.status !== 0) {
		throw new Error(
			'`tar` is required to extract the downloaded archives (it ships with Windows 10+, macOS and Linux).'
		);
	}
}

async function download(url, destination) {
	log(`downloading ${url}`);
	const response = await fetch(url);
	if (!response.ok || !response.body) {
		throw new Error(`failed to download ${url}: HTTP ${response.status}`);
	}
	await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));

	const { size } = await fs.stat(destination);
	log(`  ${(size / 1024 / 1024).toFixed(1)} MB`);
}

function extract(archive, destination, members) {
	const result = spawnSync('tar', ['-xzf', archive, '-C', destination, ...members], { stdio: 'inherit' });
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(`tar failed with exit code ${result.status}`);
	}
}

async function copyExtension(source, target) {
	if (existsSync(target) && !force) {
		log(`skipping ${path.basename(target)} (already present, use --force to refresh)`);
		return false;
	}

	await fs.rm(target, { recursive: true, force: true });
	await fs.cp(source, target, {
		recursive: true,
		filter: src => !PRUNE_NAMES.has(path.basename(src))
	});
	return true;
}

async function fetchVSCodeExtensions(tempDir) {
	const archive = path.join(tempDir, `vscode-${VSCODE_VERSION}.tar.gz`);
	await download(
		`https://codeload.github.com/microsoft/vscode/tar.gz/refs/tags/${VSCODE_VERSION}`,
		archive
	);

	const unpacked = path.join(tempDir, 'vscode');
	await fs.mkdir(unpacked, { recursive: true });
	log(`extracting ${VSCODE_EXTENSIONS.join(', ')}`);
	extract(
		archive,
		unpacked,
		VSCODE_EXTENSIONS.map(name => `vscode-${VSCODE_VERSION}/extensions/${name}`)
	);

	let copied = 0;
	for (const name of VSCODE_EXTENSIONS) {
		const source = path.join(unpacked, `vscode-${VSCODE_VERSION}`, 'extensions', name);
		if (!existsSync(source)) {
			throw new Error(`extension ${name} not found in the VS Code ${VSCODE_VERSION} archive`);
		}
		if (await copyExtension(source, path.join(extensionsDir, name))) {
			copied++;
		}
	}
	return copied;
}

/**
 * Vetur's manifest also contributes pug injections and a markdown code block
 * grammar; those are left out on purpose (they need the pug/markdown grammars to
 * be useful). Everything the common single file component uses is covered:
 * `<template>` (html + directives), `<script>` (js/ts) and `<style>`
 * (css/scss/less/postcss/sugarss).
 */
function veturManifest() {
	return {
		name: 'vue-language-basics',
		displayName: 'Vue Language Basics',
		description: 'TextMate grammar and language configuration for Vue single file components.',
		publisher: 'sidex',
		version: '1.0.0',
		license: 'MIT',
		engines: { vscode: '^1.60.0' },
		extensionKind: ['ui', 'workspace'],
		contributes: {
			languages: [
				{
					id: 'vue',
					aliases: ['Vue', 'vue'],
					extensions: ['.vue'],
					configuration: './languages/vue-language-configuration.json'
				},
				{
					id: 'vue-html',
					aliases: ['Vue HTML'],
					configuration: './languages/vue-html-language-configuration.json'
				},
				{
					id: 'vue-postcss',
					aliases: ['Vue PostCSS'],
					configuration: './languages/vue-postcss-language-configuration.json'
				},
				{
					id: 'vue-sugarss',
					aliases: ['Vue Sugarss'],
					configuration: './languages/vue-sugarss-language-configuration.json'
				}
			],
			grammars: [
				{
					language: 'vue',
					scopeName: 'source.vue',
					path: './syntaxes/vue-generated.json',
					embeddedLanguages: {
						'text.html.vue-html': 'vue-html',
						'source.css': 'css',
						'source.css.scss': 'scss',
						'source.css.less': 'less',
						'source.css.postcss': 'vue-postcss',
						'source.css.sugarss': 'vue-sugarss',
						'source.js': 'javascript',
						'source.ts': 'typescript'
					}
				},
				{ language: 'vue-html', scopeName: 'text.html.vue-html', path: './syntaxes/vue-html.tmLanguage.json' },
				{ language: 'vue-postcss', scopeName: 'source.css.postcss', path: './syntaxes/vue-postcss.json' },
				{ language: 'vue-sugarss', scopeName: 'source.css.sugarss', path: './syntaxes/vue-sugarss.json' }
			]
		}
	};
}

async function fetchVueExtension(tempDir) {
	const target = path.join(extensionsDir, 'vue');
	if (existsSync(target) && !force) {
		log('skipping vue (already present, use --force to refresh)');
		return 0;
	}

	const archive = path.join(tempDir, 'vetur.tar.gz');
	await download(`https://codeload.github.com/${VETUR_REPO}/tar.gz/${VETUR_REF}`, archive);

	const unpacked = path.join(tempDir, 'vetur');
	await fs.mkdir(unpacked, { recursive: true });
	log('extracting vetur grammars');
	extract(
		archive,
		unpacked,
		VETUR_FILES.map(file => `vetur-master/${file}`)
	);

	await fs.rm(target, { recursive: true, force: true });
	for (const file of VETUR_FILES) {
		const source = path.join(unpacked, 'vetur-master', file);
		if (!existsSync(source)) {
			throw new Error(`vetur file ${file} not found in the archive`);
		}
		const destination = path.join(target, file);
		await fs.mkdir(path.dirname(destination), { recursive: true });
		await fs.copyFile(source, destination);
	}

	await fs.writeFile(
		path.join(target, 'package.json'),
		`${JSON.stringify(veturManifest(), null, 2)}\n`
	);
	await fs.writeFile(
		path.join(target, 'NOTICE.md'),
		[
			'# Vue language basics',
			'',
			'TextMate grammar and language configurations are taken from Vetur',
			'(https://github.com/octref/vetur), MIT licensed:',
			'',
			...VETUR_FILES.map(file => `- \`${file}\``),
			'',
			'Generated by `scripts/fetch-language-extensions.mjs` - do not edit by hand.',
			''
		].join('\n')
	);
	return 1;
}

async function main() {
	requireTar();
	await fs.mkdir(extensionsDir, { recursive: true });

	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sidex-languages-'));
	try {
		const fromVSCode = await fetchVSCodeExtensions(tempDir);
		const fromVetur = await fetchVueExtension(tempDir);
		log(`installed ${fromVSCode + fromVetur} extension(s) into ${path.relative(repoRoot, extensionsDir)}`);
	} finally {
		await fs.rm(tempDir, { recursive: true, force: true });
	}

	log('next: npm run setup (regenerate extensions-meta.json) and rebuild');
}

main().catch(error => {
	console.error(`[languages] ${error.message}`);
	process.exitCode = 1;
});
