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

Use environment-specific URLs in the manifest when a slice should resolve to a local Vite dev server during development:

```ts
// runtime-composition.manifest.ts
import { defineManifest } from "runtime-module-composition";

export const manifest = defineManifest({
  namespace: "@acme",
  assetsOrigin: "https://assets.example.com",
  shared: {
    react: "https://esm.sh/react@19.2.4",
    "react-dom/client": "https://esm.sh/react-dom@19.2.4/client",
  },
  slices: {
    search: {
      route: "/search/*",
      specifier: "@acme/search",
      entry: "/search/index.mjs",
      environments: {
        development: "http://localhost:5174/src/index.tsx",
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
  shared: {
    react: "https://esm.sh/react@19.2.4",
    "react-dom/client": "https://esm.sh/react-dom@19.2.4/client",
  },
  slices: {
    search: {
      route: "/search/*",
      specifier: "@acme/search",
      entry: "/search/index.mjs",
    },
  },
};

const importMap = createImportMap(manifest);
const match = resolveRoute(manifest, "/search/routes");
const isExternal = createExternalMatcher(manifest);
```

## Development

```bash
npm install
npm run build
npm test
```
