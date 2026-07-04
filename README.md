# Runtime Module Composition

Runtime Module Composition is a small toolkit for building import-map-based microfrontends with native ESM and dynamic imports.

The project is intentionally split into a framework-agnostic core plus adapters:

- `@runtime-module-composition/core`: manifest, import map, route resolution, validation, and dynamic module loading primitives.
- `@runtime-module-composition/vite`: Vite/Rollup helpers for externalizing import-map-owned dependencies and generating HTML with import maps before module execution.
- `@runtime-module-composition/react`: React boundary for rendering dynamically imported module components.

The root package also exposes subpath imports:

```ts
import { createImportMap } from "runtime-module-composition/core";
import { externalizeRuntimeComposition } from "runtime-module-composition/vite";
import { DynamicModuleBoundary } from "runtime-module-composition/react";
```

The default root import currently targets the framework-agnostic core:

```ts
import { defineManifest, resolveRoute } from "runtime-module-composition";
```

## Vite Local Development With Import Maps

Use environment-specific origins in the manifest when a slice should resolve to a local Vite dev server during development:

```ts
// runtime-composition.manifest.ts
import { defineManifest } from "runtime-module-composition";

export const manifest = defineManifest({
  namespace: "@acme",
  assetsOrigin: "https://assets.example.com",
  externalDepsOrigin: "https://esm.sh",
  environments: {
    development: {
      sliceOrigins: {
        search: "http://localhost:5174",
      },
    },
  },
});
```

Then enable the Vite adapter in the host or local shell:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { runtimeComposition } from "runtime-module-composition/vite";
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

The Vite adapter includes the generated import map in Vite's transformed HTML and externalizes manifest-owned specifiers so Vite does not rewrite or bundle imports that should be resolved by the browser. The import map must be present in the initial HTML before any dependent module scripts execute.

## Status

Early scaffold. The current goal is to prove the package boundaries and keep the core portable before adding framework-specific behavior.

## Implementation Guides

Each public method has a usage guide in [docs/implementation-guide.md](docs/implementation-guide.md).

## Example

```ts
import {
  createExternalMatcher,
  createImportMap,
  resolveRoute,
} from "@runtime-module-composition/core";

const manifest = {
  namespace: "@acme",
  assetsOrigin: "https://assets.example.com",
  externalDepsOrigin: "https://esm.sh",
};

const importMap = createImportMap(manifest);
const match = resolveRoute(manifest, "/search/routes");
const isExternal = createExternalMatcher(manifest);
```

## Examples

- [`examples/vite-host`](examples/vite-host): a minimal Vite host shell using `runtimeComposition()`. `npm run build` inside this directory produces `dist/index.html` with the import map already present in `<head>`, proving import maps are generated before the browser receives the page rather than injected at runtime.
- [`examples/react-slice`](examples/react-slice): a minimal slice built with Vite library mode using `createRollupExternal()`. It imports React via the `@esm.sh/react` convention specifier, so `npm run build` inside this directory produces a `dist/index.mjs` that never bundles React — the browser resolves it through the host's import map instead.

These two examples are independent, separately-verified fixtures for two distinct architectural claims — they are not wired together into a working end-to-end demo. `react-slice` exports a plain React component for `DynamicModuleBoundary`, which is a different module contract than `vite-host`'s `importModule()`/`unwrapDefault()`/`mount()` DOM contract.

## Development

```bash
npm install
npm run build
npm test
```
