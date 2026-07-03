# Runtime Module Composition

Runtime Module Composition is a small toolkit for building import-map-based microfrontends with native ESM and dynamic imports.

The project is intentionally split into a framework-agnostic core plus adapters:

- `@runtime-module-composition/core`: manifest, import map, route resolution, validation, and dynamic module loading primitives.
- `@runtime-module-composition/vite`: Vite/Rollup helpers for externalizing import-map-owned dependencies and injecting local import maps.
- `@runtime-module-composition/react`: React boundary for rendering dynamically imported module components.

## Status

Early scaffold. The current goal is to prove the package boundaries and keep the core portable before adding framework-specific behavior.

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

