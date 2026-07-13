# @rmc-toolkit/core

Framework-agnostic core of [Runtime Module Composition](https://runtime-module-composition.dev): manifest-driven import map generation, route resolution, dynamic module loading, and a runtime host lifecycle that the Vite/React/Vue adapters build on. Has no dependency on any bundler or UI framework.

## Install

```bash
npm install @rmc-toolkit/core
```

## Quick example

```ts
// runtime-composition.manifest.ts
import { defineManifest } from "@rmc-toolkit/core";

export const manifest = defineManifest({
  namespace: "@acme",
  assetsOrigin: "https://assets.example.com",
  externalDepsOrigin: "https://esm.sh",
  externalDeps: [
    // The shared React singleton every other entry's peerDeps pins to by
    // name. Has no peer deps of its own, so it opts out of defaultPeerDeps
    // rather than self-referencing itself.
    { name: "react", version: "19.2.7", peerDeps: false },
    // Needs the same React instance — matches defaultPeerDeps below, so no
    // peerDeps field needed here.
    { name: "react-dom/client", version: "19.2.7" },
    {
      name: "@radix-ui/themes",
      version: "3.3.0",
      // Needs both react and react-dom, which differs from defaultPeerDeps
      // — their versions are looked up from the entries above at
      // generation time, never hand-typed here.
      peerDeps: ["react", "react-dom"],
    },
  ],
  // Applied automatically to every externalDeps entry that doesn't set its
  // own peerDeps (react-dom/client, above).
  defaultPeerDeps: ["react"],
});
```

`createRuntimeHost` resolves a path to a slice's module specifier via the manifest, imports it, and mounts/unmounts it — with built-in error recovery and protection against rapid-navigation races. It only reacts to a path string; wire it to whatever produces navigation events (a `popstate` listener, as above, or a router's own navigation callback).

If you're building a React or Vue host, use [`@rmc-toolkit/react`](https://www.npmjs.com/package/@rmc-toolkit/react) or [`@rmc-toolkit/vue`](https://www.npmjs.com/package/@rmc-toolkit/vue) instead — both wrap this same lifecycle in a framework-idiomatic hook/composable. Use this package directly for a host with no framework, or one without a dedicated adapter yet.

## What's in here

- `defineManifest`, `validateManifest` — declare and lint the manifest that drives everything else.
- `createImportMap`, `createImportMapBootstrapScript`, `resolveImportMapSpecifier` — generate the browser import map from a manifest.
- `resolveRoute` — resolve a URL path to a slice's module specifier.
- `createExternalMatcher`, `listExternalSpecifiers` — determine which specifiers a bundler should leave external (used by `@rmc-toolkit/vite`).
- `importModule`, `unwrapDefault` — the dynamic-import primitive slices/hosts load through.
- `createRuntimeHost`, `createRuntimeHostObservable`, `notifyInternalNavigation` — the resolve/import/mount/unmount lifecycle, plain and as a subscribable observable.

Full signatures and behavior for every export: [API Reference](https://runtime-module-composition.dev/api-reference/#core-rmc-toolkitcore).

## Documentation

- [Getting Started](https://runtime-module-composition.dev/getting-started/) — install and wire up a host + slice end to end
- [API Reference](https://runtime-module-composition.dev/api-reference/#core-rmc-toolkitcore)
- [Technical Implementation](https://runtime-module-composition.dev/technical-implementation/) — the architecture and failure modes behind the pattern
- [Multi-Framework Demo](https://runtime-module-composition.dev/demo/) — a full, runnable reference implementation
