# Module: app
**Role:** Application entry point — mounts the app into the DOM as a `web-ui-kit` app shell (toolbar with title/version and a light/dark theme toggle, the character file input, and the characteristics editor once a character loads), or a clear error state when the installed `web-ui-kit` version is too old.
**Files:** `src/main.ts`, `src/version.ts`, `src/web-ui-kit-version.ts`, `src/style.css`, `src/types/web-ui-kit.d.ts`
**Exports:** `appVersion: string`, `renderApp(root, version, installedWebUiKitVersion, options?): void`, `RenderAppOptions`, `MIN_SUPPORTED_WEB_UI_KIT_VERSION: string`, `isWebUiKitVersionSupported(version): boolean`
**Depends on:** `@openkakutou/web-ui-kit` (external — layout shell, tokens, button component), `modules/input.md`, `modules/document.md`, `modules/editors.md`
