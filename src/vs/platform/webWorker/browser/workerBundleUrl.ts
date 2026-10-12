/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Resolves the location of a web worker entry module.
 *
 * In a production build each worker is compiled into its own bundle by
 * `vite.workers.config.ts` (run by `npm run build:workers`) and served from
 * `/workers/<name>.js`. The worker cannot be part of the main build: modules it
 * shares with the workbench - `vs/editor/common/services/editorWebWorker.ts` is
 * also created on the main thread by `EditorWorkerService` - get hoisted into an
 * app wide chunk that reads `window` at module scope, and a dedicated worker has
 * no `window`.
 *
 * In dev the source path is used directly: the Vite dev server transpiles the
 * TypeScript entry and its imports on demand.
 *
 * @param callerModuleUrl the `import.meta.url` of the caller, so that the dev
 * path is resolved relative to the module that owns the descriptor
 * @param devSourcePath path of the worker entry relative to the caller
 * @param builtWorkerPath URL of the bundle emitted by `vite.workers.config.ts`
 */
export function workerBundleUrl(callerModuleUrl: string, devSourcePath: string, builtWorkerPath: string): URL {
	return import.meta.env.PROD
		? new URL(builtWorkerPath, callerModuleUrl)
		: new URL(devSourcePath, callerModuleUrl);
}
