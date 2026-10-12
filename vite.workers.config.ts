import { defineConfig } from 'vite';
import * as path from 'path';

/**
 * Worker bundles are compiled in a separate rollup pass (`npm run build:workers`,
 * run after the main build). A worker entry must not be part of the main build:
 * modules it shares with the workbench - e.g.
 * `vs/editor/common/services/editorWebWorker.ts`, which is also instantiated on
 * the main thread by `EditorWorkerService` - are hoisted into an app wide chunk
 * that reads `window` at module scope, and a dedicated worker has no `window`,
 * so the worker would fail to start.
 *
 * The emitted names are stable (`workers/<name>.js`) because
 * `workerBundleUrl()` in `src/vs/platform/webWorker/browser/workerBundleUrl.ts`
 * points at them at runtime.
 *
 * `nlsPlugin()` is intentionally not applied here: it rewrites `localize()` calls
 * to indices into a table that is built per build pass. A second table would not
 * match the messages the main thread hands to the worker, so worker bundles keep
 * the literal messages instead (see `localize()` in `src/vs/nls.ts`).
 */
export default defineConfig({
	clearScreen: false,
	publicDir: false,
	resolve: {
		alias: {
			vs: path.resolve(__dirname, 'src/vs')
		}
	},
	build: {
		outDir: 'dist/workers',
		emptyOutDir: true,
		target: ['es2022', 'chrome100', 'safari15'],
		minify: 'esbuild',
		sourcemap: false,
		chunkSizeWarningLimit: 5000,
		rollupOptions: {
			input: {
				editorWorker: path.resolve(__dirname, 'src/vs/editor/common/services/editorWebWorkerMain.ts'),
				textMateWorker: path.resolve(
					__dirname,
					'src/vs/workbench/services/textMate/browser/backgroundTokenization/worker/textMateTokenizationWorker.workerMain.ts'
				),
				extensionHostWorker: path.resolve(__dirname, 'src/vs/workbench/api/worker/extensionHostWorkerMain.ts'),
				outputLinkWorker: path.resolve(__dirname, 'src/vs/workbench/contrib/output/common/outputLinkComputerMain.ts')
			},
			output: {
				format: 'es',
				entryFileNames: '[name].js',
				chunkFileNames: '[name]-[hash].js',
				assetFileNames: '[name]-[hash][extname]'
			}
		}
	}
});
