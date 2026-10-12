# builtin-themes

Hand-maintained themes that SideX adds on top of the VS Code built-in themes.

`extensions/` is generated (downloaded from a VS Code installation or release,
see `scripts/setup-extensions.sh` / `scripts/fetch-language-extensions.mjs`) and
gitignored, so themes edited in there are lost on a re-download and never reach
another checkout. That is why they live here. Commit the theme files here and
they survive a fresh clone.

`scripts/apply-builtin-themes.mjs` copies this folder over `extensions/` and
re-registers the contributions in the target manifest.
`scripts/generate-extension-meta.js` runs it before writing
`extensions-meta.json` + `public/builtin-extensions.js`, so `npm run setup`,
`npm run dev` and `npm run build` all pick the themes up; `postbuild` then ships
them in `dist/extensions`, which is where the workbench loads the built-in
extensions from.

## Layout

```
builtin-themes/<extension>/…   copied over extensions/<extension>/…
builtin-themes/manifest.json   contributions re-registered in <extension>/package.json
```

`manifest.json` never replaces the upstream manifest - it only prepends
contributions whose `id` is not registered yet (so SideX themes stay on top of
their section in the theme picker) and merges `nls` labels into
`package.nls.json`. Applying it twice is a no-op, and when `extensions/` is
empty the script warns and skips instead of failing the build.

## Themes

| Extension      | Theme      | uiTheme | File                         |
| -------------- | ---------- | ------- | ---------------------------- |
| theme-defaults | Light 2026 | vs      | `themes/2026-light.json`     |
| theme-defaults | Dark 2026  | vs-dark | `themes/2026-dark.json`      |

## Adding a theme

1. Put the color theme JSON under `builtin-themes/theme-defaults/themes/`.
2. Add its contribution (and, if you use a `%label%` placeholder, the label) to
   `manifest.json`.
3. Run `npm run setup` and rebuild.

Themes are user-facing settings by id (`workbench.colorTheme`); the id in the
manifest is what `ThemeSettingDefaults` / `migrateThemeSettingsId`
(`src/vs/workbench/services/themes/common/workbenchThemeService.ts`) refer to.
