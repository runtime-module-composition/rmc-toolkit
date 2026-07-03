# Implementation Guide

This guide explains how to use each public method in Runtime Module Composition. The package is split into a framework-agnostic core plus Vite and React adapters.

## Core Methods

Import from either the root package or the core subpath:

```ts
import {
  createExternalMatcher,
  createImportMap,
  defineManifest,
  listExternalSpecifiers,
  loadRuntimeModule,
  resolveRoute,
  unwrapRuntimeModule,
  validateManifest,
} from "runtime-module-composition/core";
```

The root import also targets core:

```ts
import { defineManifest, createImportMap } from "runtime-module-composition";
```

### `defineManifest(manifest)`

Use `defineManifest()` to declare the composition contract for a host application. It preserves the exact TypeScript shape of your manifest while ensuring it satisfies `RuntimeCompositionManifest`.

```ts
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

Implementation notes:

- `namespace` is the bare module namespace owned by your composed application.
- `assetsOrigin` is the production asset host for conventionally resolved slice modules.
- `externalDepsOrigin` is the origin for external dependency specifiers. By default, it maps the `@esm.sh/` prefix to this origin.
- `entryFile` defaults to `index.mjs`, so `/search/routes` resolves to `@acme/search/index.mjs`.
- `environments.development.sliceOrigins` lets local development map one slice prefix to a dev server.
- `routeOverrides` and `sliceOverrides` are optional escape hatches for nonstandard cases.

### `createImportMap(manifest, options)`

Use `createImportMap()` when the host needs a browser import map generated from the manifest.

```ts
import { createImportMap } from "runtime-module-composition/core";
import { manifest } from "./runtime-composition.manifest";

const importMap = createImportMap(manifest, {
  environment: "development",
});

const importMapScript = `<script type="importmap">${JSON.stringify(importMap)}</script>`;
const html = templateHtml.replace("<!-- runtime import map -->", importMapScript);
```

Implementation notes:

- Import maps must be present in the initial HTML before any dependent module scripts execute.
- Do not add the import map after app startup with DOM APIs such as `document.head.append()`.
- In Vite projects, prefer `runtimeComposition()` or `includeRuntimeImportMap()` so the HTML is transformed before the browser receives it.
- Production slice URLs resolve through the namespace prefix, such as `@acme/` to `https://assets.example.com/`.
- External dependencies resolve through `externalDepsPrefix`, which defaults to `@esm.sh/`.
- Environment origins override production origins for local development or preview deployments.
- `sliceOrigins` adds more specific import-map prefixes, such as `@acme/search/` to `http://localhost:5174/`.
- Non-Vite build systems should generate the import-map script during their HTML build step.

### `resolveRoute(manifest, path)`

Use `resolveRoute()` in the host shell to map the current URL to the slice that owns it.

```ts
import { resolveRoute } from "runtime-module-composition/core";
import { manifest } from "./runtime-composition.manifest";

const match = resolveRoute(manifest, window.location.pathname);

if (match) {
  await import(/* @vite-ignore */ match.specifier);
}
```

Implementation notes:

- By default, the first URL segment becomes the slice name.
- `/search/routes` resolves to `@acme/search/index.mjs` when `entryFile` is not customized.
- Explicit `routeOverrides` entries beat convention-based resolution.
- Return value is `null` for `/` unless a route override is configured.

### `listExternalSpecifiers(manifest)`

Use `listExternalSpecifiers()` when you need a concrete list of import-map-owned specifiers.

```ts
import { listExternalSpecifiers } from "runtime-module-composition/core";

const externals = listExternalSpecifiers(manifest);
```

Implementation notes:

- The namespace prefix, such as `@acme/`, is external by default.
- The external dependency prefix, such as `@esm.sh/`, is external when `externalDepsOrigin` is configured.
- Explicit `exactImports` dependencies and `sliceOverrides` are also external by default when configured.
- Set `external: false` on an explicit `exactImports` entry or `sliceOverrides` entry to exclude it from the list.
- Build adapters use this indirectly through `createExternalMatcher()`.

### `createExternalMatcher(manifest)`

Use `createExternalMatcher()` to create a Rollup/Vite-compatible external predicate from the manifest.

```ts
import { createExternalMatcher } from "runtime-module-composition/core";

const isExternal = createExternalMatcher(manifest);

export default {
  build: {
    rollupOptions: {
      external: isExternal,
    },
  },
};
```

Implementation notes:

- Any specifier under the manifest namespace, such as `@acme/search/index.mjs`, is matched.
- Any specifier under the external dependency prefix, such as `@esm.sh/react`, is matched when `externalDepsOrigin` is configured.
- Explicit `exactImports` and `sliceOverrides` specifiers are also matched when configured.
- This keeps import-map-owned modules out of slice bundles.

### `loadRuntimeModule(specifier, importer)`

Use `loadRuntimeModule()` when working with the framework-agnostic DOM module contract.

```ts
import { loadRuntimeModule } from "runtime-module-composition/core";

const module = await loadRuntimeModule("@acme/search/index.mjs");
await module.mount(document.getElementById("slot")!);
```

Implementation notes:

- The default importer calls native dynamic `import()`.
- The loaded module must export a `mount(target, context?)` function, either directly or as default.
- Pass a custom `importer` in tests or in hosts that need custom loading behavior.
- React users usually use `DynamicModuleBoundary()` instead.

### `unwrapRuntimeModule(value)`

Use `unwrapRuntimeModule()` when you already have a module namespace and need to validate the DOM module contract.

```ts
import { unwrapRuntimeModule } from "runtime-module-composition/core";

const namespace = await import("@acme/search/index.mjs");
const module = unwrapRuntimeModule(namespace);
```

Implementation notes:

- Accepts either `{ mount }` or `{ default: { mount } }`.
- Throws a `TypeError` if the module does not expose `mount()`.
- Useful for tests, custom loaders, and diagnostic tooling.

### `validateManifest(manifest)`

Use `validateManifest()` in CI, tests, or startup diagnostics to catch manifest drift early.

```ts
import { validateManifest } from "runtime-module-composition/core";

const diagnostics = validateManifest(manifest);
const errors = diagnostics.filter((item) => item.level === "error");

if (errors.length > 0) {
  throw new Error(errors.map((item) => item.message).join("\n"));
}
```

Implementation notes:

- Invalid `assetsOrigin` values are errors.
- Invalid `externalDepsOrigin` values are errors.
- Namespace, external dependency prefix, route override, and slice override mismatches are warnings.
- Slice override entries that do not look like ESM assets are warnings unless they are absolute URLs.
- Keep this in CI once the manifest becomes a release contract.

### URL Helpers

The core also exports small URL helpers used internally by import-map generation:

```ts
import {
  joinUrl,
  trimLeadingSlash,
  trimTrailingSlash,
} from "runtime-module-composition/core";
```

Implementation notes:

- These are intentionally tiny utilities.
- Use them when writing deployment adapters that need to resolve asset URLs consistently with core.

## Vite Adapter Methods

Import from the Vite subpath:

```ts
import {
  createRollupExternal,
  externalizeRuntimeComposition,
  includeRuntimeImportMap,
  runtimeComposition,
} from "runtime-module-composition/vite";
```

### `runtimeComposition(options)`

Use `runtimeComposition()` for local development in a Vite host or shell. It returns both required plugins: import-map HTML generation and dependency externalization.

```ts
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

Implementation notes:

- Use this as the default Vite integration.
- Set `environment: "development"` for local dev-server slice URLs.
- Set `includeImportMap: false` if your HTML already includes an import map before module scripts.
- Set `externalize: false` only when intentionally bundling mapped dependencies.

### `includeRuntimeImportMap(options)`

Use `includeRuntimeImportMap()` when you only want Vite to generate HTML that includes the import map.

```ts
import { includeRuntimeImportMap } from "runtime-module-composition/vite";

export default defineConfig({
  plugins: [
    includeRuntimeImportMap({
      manifest,
      environment: "development",
    }),
  ],
});
```

Implementation notes:

- Adds a `<script type="importmap" data-runtime-module-composition>` tag.
- Replaces an existing Runtime Module Composition import map if one already exists.
- Runs as a Vite HTML transform before the browser receives `index.html`.
- Does not add an import map after app startup.
- Does not externalize imports by itself.

### `externalizeRuntimeComposition(options)`

Use `externalizeRuntimeComposition()` when you only want Vite to preserve import-map-owned specifiers.

```ts
import { externalizeRuntimeComposition } from "runtime-module-composition/vite";

export default defineConfig({
  plugins: [
    externalizeRuntimeComposition({
      manifest,
    }),
  ],
});
```

Implementation notes:

- Prevents Vite from optimizing or rewriting mapped specifiers during local dev.
- Returns external IDs for manifest-owned imports.
- Pair with an import map that is already present in the initial HTML.

### `createRollupExternal(manifest)`

Use `createRollupExternal()` in production library builds for slice modules.

```ts
import { createRollupExternal } from "runtime-module-composition/vite";
import { manifest } from "./runtime-composition.manifest";

export default defineConfig({
  build: {
    lib: {
      entry: ["src/index.tsx"],
      formats: ["es"],
      fileName: () => "index.mjs",
    },
    rollupOptions: {
      external: createRollupExternal(manifest),
    },
  },
});
```

Implementation notes:

- Use this in slice builds so import-map-owned dependencies are not bundled.
- The predicate is generated from the same manifest that creates the import map.
- This is the main mechanism that prevents import-map/build-rule drift.

## React Adapter Methods

Import from the React subpath:

```tsx
import { DynamicModuleBoundary } from "runtime-module-composition/react";
```

### `DynamicModuleBoundary(props)`

Use `DynamicModuleBoundary()` inside a React host when a route resolves to a React slice module.

```tsx
import { resolveRoute } from "runtime-module-composition";
import { DynamicModuleBoundary } from "runtime-module-composition/react";
import { manifest } from "./runtime-composition.manifest";

export function RouteSlot() {
  const match = resolveRoute(manifest, window.location.pathname);

  if (!match) {
    return null;
  }

  return (
    <DynamicModuleBoundary
      specifier={match.specifier}
      context={{ route: match, manifest }}
      fallback={<div>Loading...</div>}
      errorFallback={<div>Unable to load this section.</div>}
    />
  );
}
```

Implementation notes:

- The slice module should default export a React component.
- The component receives `{ context }` when context is provided.
- The adapter uses `React.lazy()` and `React.Suspense`.
- `errorFallback` is rendered if the dynamic import or render fails.
- Pass a custom `importer` for tests or advanced loading behavior.
- This adapter does not use iframes; it renders the loaded component inside the host React tree.

## Recommended Implementation Order

1. Define the manifest with `defineManifest()`.
2. Validate it with `validateManifest()` in tests or CI.
3. Generate the browser import map with `createImportMap()` or Vite `runtimeComposition()`.
4. Use `createRollupExternal()` in slice production builds.
5. Resolve routes with `resolveRoute()` in the host shell.
6. Load the resolved slice with a framework adapter, such as `DynamicModuleBoundary()`, or with the DOM contract via `loadRuntimeModule()`.
