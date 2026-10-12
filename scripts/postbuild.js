import fs from 'fs';
import path from 'path';

const DIST_DIR = 'dist';
const ASSETS_DIR = path.join(DIST_DIR, 'assets');

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileSizes(dir, extension) {
  if (!fs.existsSync(dir)) return { total: 0, files: [] };

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith(extension))
    .map(f => ({
      name: f,
      size: fs.statSync(path.join(dir, f)).size
    }))
    .sort((a, b) => b.size - a.size);

  return {
    total: files.reduce((sum, f) => sum + f.size, 0),
    files
  };
}

// Copy extensions
if (fs.existsSync('extensions')) {
  fs.cpSync('extensions', path.join(DIST_DIR, 'extensions'), { recursive: true, force: true });
}
if (fs.existsSync('extensions-meta.json')) {
  fs.copyFileSync('extensions-meta.json', path.join(DIST_DIR, 'extensions-meta.json'));
}
console.log('Post-build: copied extensions\n');

// Copy node modules that are loaded at runtime via `importAMDNodeModule()`
// (see src/vs/amdX.ts). Those modules are addressed as
// `<origin>/vendor/<name>/<path>` in packaged builds: they have to exist in
// `dist` for those builds, and they cannot live in a `node_modules` folder
// because Tauri rejects a `frontendDist` that contains one. In dev the Vite dev
// server serves them from the project `node_modules` directory.
const RUNTIME_NODE_MODULES = [
  ['@vscode/iconv-lite-umd', 'lib/iconv-lite-umd.js'], // text file encoding (BOM, UTF-16, legacy charsets)
  ['jschardet', 'dist/jschardet.min.js'] // encoding detection
];

for (const [nodeModuleName, relativePath] of RUNTIME_NODE_MODULES) {
  const source = path.join('node_modules', nodeModuleName, relativePath);
  if (!fs.existsSync(source)) {
    console.warn(`Post-build: missing runtime node module ${source}, skipping`);
    continue;
  }

  const target = path.join(DIST_DIR, 'vendor', nodeModuleName, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  console.log(`Post-build: copied ${source} -> ${target}`);
}
console.log('');

// Calculate bundle sizes
const js = getFileSizes(ASSETS_DIR, '.js');
const css = getFileSizes(ASSETS_DIR, '.css');
const wasm = getFileSizes(ASSETS_DIR, '.wasm');
const other = getFileSizes(ASSETS_DIR, '.ttf');

console.log('═══════════════════════════════════════════════════════════');
console.log('                    BUNDLE SIZE SUMMARY                     ');
console.log('═══════════════════════════════════════════════════════════');
console.log(`  JavaScript:  ${formatSize(js.total).padStart(12)}`);
console.log(`  CSS:         ${formatSize(css.total).padStart(12)}`);
console.log(`  Fonts:       ${formatSize(other.total).padStart(12)}`);
console.log(`  WASM:        ${formatSize(wasm.total).padStart(12)}`);
console.log('───────────────────────────────────────────────────────────');
console.log(`  TOTAL:       ${formatSize(js.total + css.total + other.total + wasm.total).padStart(12)}`);
console.log('═══════════════════════════════════════════════════════════');

// Show top 5 largest JS files
console.log('\nTop 5 largest JS chunks:');
js.files.slice(0, 5).forEach((f, i) => {
  console.log(`  ${i + 1}. ${f.name.padEnd(50)} ${formatSize(f.size).padStart(10)}`);
});
console.log('');
