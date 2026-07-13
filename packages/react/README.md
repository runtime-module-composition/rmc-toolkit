# @rmc-toolkit/react

React adapter for [Runtime Module Composition](https://runtime-module-composition.dev). Two factories, for two different slice conventions — pick the one matching how your slices are written, not both for the same slice. Both take your app's own already-resolved `React` instance rather than importing one themselves, so this package never bundles a second, conflicting copy of React.

## Install

```bash
npm install @rmc-toolkit/react @rmc-toolkit/core react
```

## Quick example

**Slices share the `mount()`/`unmount()` convention:** use `createReactAdapter`, which wraps the resolve/import/mount lifecycle in a `useRuntimeHost` hook:

```ts
// src/rmc-adapter.ts
import React from "react";
import { createReactAdapter } from "@rmc-toolkit/react";

export const { useRuntimeHost } = createReactAdapter(React);
```

```tsx
// App.tsx
import { useLocation } from "react-router-dom";
import { useRuntimeHost } from "./rmc-adapter";
import { manifest } from "./runtime-composition.manifest";

function App() {
  const location = useLocation();
  const { ref, status } = useRuntimeHost<HTMLElement>(location.pathname, { manifest });

  return (
    <div className="app-shell">
      <SiteHeader loading={status.type === "loading"} />
      <main ref={ref} />
      <SiteFooter />
    </div>
  );
}
```

**Slices are plain default-exported components (not `mount()`/`unmount()`):** use `createDynamicModuleBoundary` instead:

```tsx
// src/rmc-adapter.ts
import React from "react";
import { createDynamicModuleBoundary } from "@rmc-toolkit/react";

export const { DynamicModuleBoundary } = createDynamicModuleBoundary(React);
```

```tsx
// RouteSlot.tsx
import { resolveRoute } from "@rmc-toolkit/core";
import { DynamicModuleBoundary } from "./rmc-adapter";
import { manifest } from "./runtime-composition.manifest";

export function RouteSlot() {
  const match = resolveRoute(manifest, window.location.pathname);
  if (!match) return null;

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

## What's in here

- `createReactAdapter(React)` → `{ useRuntimeHost }` — a hook wrapping `createRuntimeHostObservable`'s resolve/import/mount/unmount lifecycle, with loading/error status.
- `createDynamicModuleBoundary(React)` → `{ DynamicModuleBoundary }` — a `Suspense` + error-boundary component around `React.lazy()`-loading a slice's default-exported component.

Full signatures and behavior for both: [API Reference](https://runtime-module-composition.dev/api-reference/#react-adapter-rmc-toolkitreact).

## Documentation

- [Getting Started](https://runtime-module-composition.dev/getting-started/) — install and wire up a host + slice end to end
- [API Reference](https://runtime-module-composition.dev/api-reference/#react-adapter-rmc-toolkitreact)
- [Technical Implementation](https://runtime-module-composition.dev/technical-implementation/) — the architecture and failure modes behind the pattern
- [Multi-Framework Demo](https://runtime-module-composition.dev/demo/) — a full, runnable reference implementation, including a React slice
