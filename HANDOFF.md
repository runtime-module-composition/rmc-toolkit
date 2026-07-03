# Runtime Module Composition Handoff

Last updated: 2026-07-03

## Repository

- Local package repo: `/Users/angelovagenas/Documents/GitHub/FERRY-RSVP/repositories/runtime-module-composition`
- GitHub remote: `https://github.com/runtime-module-composition/runtime-module-composition.git`
- Docs-site repo was moved to: `/Users/angelovagenas/Documents/GitHub/FERRY-RSVP/repositories/runtime-module-composition.dev`
- Docs-site remote: `https://github.com/runtime-module-composition/runtime-module-composition.dev.git`

Do not confuse the two local folders:

- `runtime-module-composition` is the package/toolkit repo.
- `runtime-module-composition.dev` is the Astro Starlight documentation website.

## Current Git State

`main` is tracking `origin/main`.

Latest pushed commit before this handoff work began:

```txt
a48ce56 Rename import map HTML generation API
```

This handoff includes a convention-first manifest refactor plus this `HANDOFF.md`. If you are reading this from a later commit, these changes should already be part of the repository history. If you are reading this from a live workspace before commit, they may appear as local modifications.

The convention-first changes pivot the package from an explicit slice registry model to an origin/prefix convention model. Files touched:

```txt
README.md
docs/implementation-guide.md
packages/core/src/externals.ts
packages/core/src/import-map.ts
packages/core/src/index.test.ts
packages/core/src/routes.ts
packages/core/src/types.ts
packages/core/src/validation.ts
packages/vite/src/index.test.ts
```

Verification of this handoff scope:

```bash
npm run build
npm test
```

Both commands passed locally after the convention-first changes.

## Product Direction

The package should express the core value of Runtime Module Composition:

> The host should not need to register every slice or every route. A URL route and an import-map prefix should be enough for normal cases.

The user explicitly pushed back on boilerplate like:

```ts
search: {
  route: "/search/*",
  specifier: "@acme/search",
  entry: "/search/index.mjs",
  environments: {
    development: "http://localhost:5174/src/index.tsx",
  },
}
```

That model is too verbose. The desired shape is convention-first:

```ts
defineManifest({
  namespace: "@acme",
  assetsOrigin: "https://assets.acme.com",
  externalDepsOrigin: "https://esm.sh",
});
```

From that:

```txt
/search/routes -> @acme/search/index.mjs
@acme/         -> https://assets.acme.com/
@esm.sh/       -> https://esm.sh/
```

Explicit route/slice configuration should be treated as an escape hatch only.

## Non-Negotiable Architectural Constraints

### No Runtime Import-Map Mutation

Import maps must be present in the initial HTML before dependent module scripts execute.

Do not document or implement patterns that add import maps after app startup with DOM APIs like:

```ts
document.head.append(...)
```

The Vite adapter should be framed as HTML generation/transformation before the browser receives `index.html`, not runtime injection.

Current API name after correction:

```ts
includeRuntimeImportMap()
```

Avoid reintroducing:

```ts
injectRuntimeImportMap()
```

### No Iframes

Runtime Module Composition does not use iframes. Slices are native ESM modules loaded into the same page and rendered by the host application or framework adapter.

### Convention Before Configuration

Normal route/slice mapping should work without declaring every slice. Configuration should primarily define origins and conventions.

## Package Layout

Workspace packages:

```txt
packages/core
packages/vite
packages/react
```

Root package supports subpath imports:

```ts
import { defineManifest, resolveRoute } from "runtime-module-composition";
import { createImportMap } from "runtime-module-composition/core";
import { runtimeComposition } from "runtime-module-composition/vite";
import { DynamicModuleBoundary } from "runtime-module-composition/react";
```

Scoped workspace package imports also exist internally:

```ts
@runtime-module-composition/core
@runtime-module-composition/vite
@runtime-module-composition/react
```

## Current Core API Intent

### `defineManifest()`

Should preserve manifest typing and support a minimal convention-first contract:

```ts
defineManifest({
  namespace: "@acme",
  assetsOrigin: "https://assets.example.com",
  externalDepsOrigin: "https://esm.sh",
});
```

This handoff also supports:

```ts
entryFile?: string; // defaults to index.mjs
externalDepsPrefix?: string; // defaults to @esm.sh/
environments?: {
  development?: {
    assetsOrigin?: string;
    externalDepsOrigin?: string;
    sliceOrigins?: Record<string, string>;
  };
};
routes?: Record<string, string | { specifier: string; route?: string | string[] }>;
slices?: Record<string, SliceConfig>; // escape hatch, not primary API
shared?: Record<string, SharedDependencyConfig>; // escape hatch for exact deps
```

### `createImportMap()`

Desired default output:

```ts
createImportMap({
  namespace: "@acme",
  assetsOrigin: "https://assets.example.com",
  externalDepsOrigin: "https://esm.sh",
});
```

Should produce:

```json
{
  "imports": {
    "@acme/": "https://assets.example.com/",
    "@esm.sh/": "https://esm.sh/"
  }
}
```

Local dev with one slice on a dev server:

```ts
defineManifest({
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

Should produce a more specific dev prefix:

```json
{
  "imports": {
    "@acme/": "https://assets.example.com/",
    "@esm.sh/": "https://esm.sh/",
    "@acme/search/": "http://localhost:5174/"
  }
}
```

### `resolveRoute()`

Desired convention:

```txt
/search/routes -> @acme/search/index.mjs
/booking       -> @acme/booking/index.mjs
/              -> null unless overridden
```

Root route should require an explicit override, for example:

```ts
routes: {
  "/": "@acme/home/index.mjs",
}
```

Potential future work:

- Add configurable base path stripping.
- Add locale prefix stripping, e.g. `/en/search` -> `search`.
- Add a configurable route segment resolver for apps that do not want the first URL segment to be the slice name.

### `createExternalMatcher()`

Should externalize by prefix:

```txt
@acme/*
@esm.sh/*
```

This keeps Vite/Rollup aligned with the generated import map without listing every dependency or slice.

## Vite Adapter Direction

Current intended public exports:

```ts
runtimeComposition()
includeRuntimeImportMap()
externalizeRuntimeComposition()
createRollupExternal()
```

`runtimeComposition()` should remain the recommended integration:

```ts
export default defineConfig({
  plugins: [
    ...runtimeComposition({
      manifest,
      environment: "development",
    }),
  ],
});
```

Behavior:

- Include the import map in transformed HTML before module scripts run.
- Externalize manifest-owned prefixes/specifiers.
- Do not imply runtime injection.

## React Adapter Direction

Current `DynamicModuleBoundary` assumes a dynamically imported module default-exports a React component.

Keep this adapter as framework-specific.

Do not move React concepts into `core`.

Longer term, core should support a DOM contract:

```ts
export type RuntimeModule = {
  mount(target: Element, context?: RuntimeModuleContext): void | Promise<void>;
  unmount?(): void | Promise<void>;
};
```

React should remain one adapter among possible future adapters.

## Important Current WIP Details

The local WIP currently modifies tests to reflect the convention-first API.

Notable test expectations:

```ts
createImportMap(manifest)
// imports:
// "@acme/": "https://assets.example.com/"
// "@esm.sh/": "https://esm.sh/"
```

```ts
resolveRoute(manifest, "/search/routes")?.specifier
// "@acme/search/index.mjs"
```

```ts
resolveRoute(manifest, "/")
// null
```

```ts
createExternalMatcher(manifest)("@esm.sh/react")
// true
```

The tests passed locally with these convention-first changes.

## Documentation State

Docs exist in:

```txt
docs/implementation-guide.md
README.md
```

The handoff changes update these docs toward the convention-first model. Another AI should still review the full guide after continuing the refactor to remove any remaining registry-first language.

Search for stale language:

```bash
rg -n "slices|shared|inject|injection|document.head.append|specifier:|route:" README.md docs packages
```

Some occurrences of `slices` and `shared` are valid because those are still escape-hatch APIs. The important thing is that examples should not suggest every normal route must be declared.

## Recommended Next Steps

1. Review the latest diff or handoff commit.

   ```bash
   git diff
   ```

2. Confirm convention-first behavior is exactly what the package should support.

3. Decide whether to keep `shared` and `slices` as escape-hatch names or rename them to make their exceptional nature clearer, for example:

   ```ts
   exactImports
   routeOverrides
   sliceOverrides
   ```

4. Run:

   ```bash
   npm run build
   npm test
   ```

5. If the convention-first refactor is not already committed in your checkout, commit it once it still passes.

   Suggested commit message:

   ```txt
   Refactor manifest around origin conventions
   ```

6. Add a small example fixture later:

   ```txt
   examples/vite-host
   examples/react-slice
   ```

   This should prove local Vite development works with an import map present in the initial HTML.

7. Revisit publishing strategy:

   - Root package is currently `private: true`.
   - Decide whether to publish the root aggregate package, the scoped workspace packages, or both.
   - If publishing root package, ensure `files` includes the docs and built package output.

## Commands

Install:

```bash
npm install
```

Build:

```bash
npm run build
```

Test:

```bash
npm test
```

Typecheck:

```bash
npm run typecheck
```

Clean TypeScript build output:

```bash
npm run clean
```

## Last Known Verification

At handoff time, with local WIP present:

```txt
npm run build  -> passed
npm test       -> passed
```
