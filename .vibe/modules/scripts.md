# Module: scripts
**Role:** Dev-tooling scripts outside the app bundle — currently, downloading the `character` library's WebAssembly release build.
**Files:** `scripts/download-wasm.mjs`
**Exports:** `downloadWasmRelease(options): Promise<string[]>`, `main(argv?, overrides?): Promise<number>`, `DownloadError`, `EXIT_CODES`
**Depends on:** none (plain Node.js, injectable `fetch`)
