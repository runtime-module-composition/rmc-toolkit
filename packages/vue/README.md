# @rmc-toolkit/vue

Vue adapter for [Runtime Module Composition](https://runtime-module-composition.dev). Wraps the same resolve/import/mount/unmount lifecycle as `@rmc-toolkit/react` in a Vue composable. Takes your app's own already-resolved `Vue` instance rather than importing one itself, so this package never bundles a second, conflicting copy of Vue.

## Install

```bash
npm install @rmc-toolkit/vue @rmc-toolkit/core vue
```

## Quick example

```ts
// src/rmc-adapter.ts
import * as Vue from "vue";
import { createVueAdapter } from "@rmc-toolkit/vue";

export const { useRuntimeHost } = createVueAdapter(Vue);
```

```ts
// App.vue (render-function form)
import { useRoute } from "vue-router";
import { useRuntimeHost } from "./rmc-adapter";
import { manifest } from "./runtime-composition.manifest";

export default {
  setup() {
    const route = useRoute();
    const { target, status } = useRuntimeHost(() => route.fullPath, { manifest });
    return { target, status };
  },
  template: `<main ref="target"></main>`,
};
```

`path` is a getter (`() => route.fullPath`), not a plain value, so the adapter can watch it reactively and re-resolve on navigation.

## What's in here

- `createVueAdapter(Vue)` → `{ useRuntimeHost }` — a composable wrapping `createRuntimeHostObservable`'s resolve/import/mount/unmount lifecycle, exposing `target` (a ref to bind to your mount element) and `status` (a reactive ref).

Full signature and behavior: [API Reference](https://runtime-module-composition.dev/api-reference/#vue-adapter-rmc-toolkitvue).

## Documentation

- [Getting Started](https://runtime-module-composition.dev/getting-started/) — install and wire up a host + slice end to end
- [API Reference](https://runtime-module-composition.dev/api-reference/#vue-adapter-rmc-toolkitvue)
- [Technical Implementation](https://runtime-module-composition.dev/technical-implementation/) — the architecture and failure modes behind the pattern
- [Multi-Framework Demo](https://runtime-module-composition.dev/demo/) — a full, runnable reference implementation, including a Vue slice
