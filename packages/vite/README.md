# @rmc-toolkit/vite

Vite/Rollup adapter for [Runtime Module Composition](https://runtime-module-composition.dev): injects the generated import map into a host's HTML before any module script runs, externalizes import-map-owned specifiers so Vite doesn't bundle or rewrite them, and provides `defineSliceBuild()` for a slice's own build config.

## Install

```bash
npm install @rmc-toolkit/vite @rmc-toolkit/core vite
```

## Quick example

**Host** — wire the plugin into `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { runtimeComposition } from "@rmc-toolkit/vite";
import { manifest } from "./runtime-composition.manifest";

export default defineConfig({
  plugins: [
    ...runtimeComposition({
      manifest,
      environment: "development",
    }),
  ],
});
```

`runtimeComposition()` returns two plugins: one that injects the generated import map into `index.html`, and one that tells Vite not to bundle or rewrite specifiers the import map owns.

**Slice** — build as an ESM library that externalizes anything the import map owns:

```ts
import { defineConfig } from "vite";
import { defineSliceBuild, createRollupExternal } from "@rmc-toolkit/vite";
import { manifest } from "./runtime-composition.manifest";

export default defineConfig(({ mode }) => {
  const sliceBuild = defineSliceBuild({ mode, devPort: 5174, sliceName: "search" });

  return mode === "development"
    ? sliceBuild
    : {
        ...sliceBuild,
        build: {
          ...sliceBuild.build,
          rollupOptions: { external: createRollupExternal(manifest) },
        },
      };
});
```

`sliceName` determines where the production build lands (`dist/{sliceName}/index.mjs`), matching the path convention `resolveRoute()`/`createImportMap()` already assume — a slice's build output requires no separate assembly step to match its production URL.

## What's in here

- `runtimeComposition` — the combined host-side plugin pair (import-map injection + externalization).
- `includeRuntimeImportMap`, `externalizeRuntimeComposition` — the two plugins individually, if you need only one.
- `createRollupExternal` — a Rollup `external` function, for a slice's production build.
- `defineSliceBuild` — mode-aware Vite config for a slice (dev-server port, the library-build `process.env.NODE_ENV` fix, entry auto-detection).
- `includeHostedImportMap`, `buildLocalImportMapScript` — for serving the import map as a standalone hosted script rather than inlined into HTML (e.g. a production static-asset host), with local-dev override support.

Full signatures and behavior for every export: [API Reference](https://runtime-module-composition.dev/api-reference/#vite-adapter-rmc-toolkitvite).

## Documentation

- [Getting Started](https://runtime-module-composition.dev/getting-started/) — install and wire up a host + slice end to end
- [API Reference](https://runtime-module-composition.dev/api-reference/#vite-adapter-rmc-toolkitvite)
- [Technical Implementation](https://runtime-module-composition.dev/technical-implementation/) — the architecture and failure modes behind the pattern
- [Multi-Framework Demo](https://runtime-module-composition.dev/demo/) — a full, runnable reference implementation
