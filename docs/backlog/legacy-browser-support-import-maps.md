# Backlog: legacy browser support for import maps (es-module-shims)

Status: **not scheduled** — sketch only, for discussion when it becomes relevant.

## Motivation

Native `<script type="importmap">` support is Baseline "Widely available"
(Chrome/Edge 89+, Firefox 108+, Safari 16.4+), roughly 93-94% of global
browser share. This toolkit currently emits a bare `<script type="importmap">`
tag ([`includeRuntimeImportMap`](../../packages/vite/src/index.ts) at
`packages/vite/src/index.ts:48`) with no fallback — on a browser without
native support, every dependent module script fails to resolve and the host
shell doesn't render at all. Whether that's acceptable depends on the
consuming application's audience/browser-support requirements, which is why
this is backlog rather than a default.

[es-module-shims](https://github.com/guybedford/es-module-shims) is the
de facto standard polyfill. It feature-detects: on browsers with native
import map support it's effectively a no-op, and it only does polyfill work
(fetching module source, rewriting specifiers, resolving via Blob URLs +
dynamic `import()`) on the remaining minority. It requires a baseline of
`<script type="module">` + dynamic `import()` support — it does not extend
support to pre-ESM browsers (e.g. IE11); that's a fundamentally different,
non-import-map-based strategy and out of scope here.

## Proposed approach

Add an opt-in option to the Vite adapter that injects the shim `<script>`
immediately before the generated import map script, in the same
`transformIndexHtml` hook that already owns import-map injection.

### Option sketch (`packages/vite/src/index.ts`)

```ts
export type RuntimeCompositionViteOptions = {
  manifest: RuntimeCompositionManifest;
  environment?: RuntimeEnvironment;
  includeImportMap?: boolean;
  externalize?: boolean;
  // NEW:
  legacyImportMapSupport?:
    | boolean
    | {
        shimUrl?: string; // defaults to a pinned CDN URL or a locally vendored copy
      };
};
```

### Injection sketch

```ts
export const includeRuntimeImportMap = ({
  manifest,
  environment = "development",
  legacyImportMapSupport,
}: RuntimeCompositionViteOptions): Plugin => ({
  name: "runtime-module-composition-include-import-map",
  transformIndexHtml(html) {
    const importMap = createImportMap(manifest, { environment });
    const mapScript = `<script type="importmap" data-runtime-module-composition>${JSON.stringify(importMap)}</script>`;

    const shimScript = legacyImportMapSupport
      ? `<script async src="${resolveShimUrl(legacyImportMapSupport)}"></script>\n    `
      : "";

    // shimScript + mapScript, same head-insertion logic as today
  },
});
```

The shim script must be inserted **before** the import map script (it needs
to be present and executing by the time the browser parses the map), matching
the existing constraint that the import map itself must precede any
dependent module script.

## Open questions

- **Shim source**: pull from a CDN (e.g. jspm's `ga.jspm.io`, matching the
  project's existing `esm.sh`-based `externalDepsOrigin` convention) vs.
  vendoring/self-hosting a pinned version. CDN is simplest but adds a
  third-party runtime dependency and a CSP allowance; self-hosting avoids
  that at the cost of a version-bump maintenance step.
- **Version pinning**: should the adapter pin a specific es-module-shims
  version by default, or require the consumer to supply `shimUrl` explicitly?
  Unpinned/"latest" is a supply-chain risk given this script runs unsandboxed
  in the host page.
- **Default on or off**: since the shim is a no-op on supporting browsers,
  it's tempting to default it on. Counter-argument: it's still an extra
  network request + third-party script on every page load for the ~94% of
  users who don't need it, and some consumers may have stricter CSP/vendoring
  requirements. Leaning toward opt-in (`legacyImportMapSupport: true`) rather
  than a silent default.
- **Interaction with `sliceOrigins`/multiple import maps**: if a later
  iteration adds runtime-injected supplemental import maps (see
  [ab-testing-via-import-maps.md](ab-testing-via-import-maps.md)'s deferred-assignment
  case), confirm es-module-shims' polyfilled merge behavior matches the native
  spec algorithm closely enough that behavior doesn't diverge between shimmed
  and native browsers.
- **Testing**: how do we get CI coverage for the shimmed path without a real
  legacy browser in the test matrix (e.g. Playwright with a forced
  feature-detection override, or a headless browser pinned to an old version)?

## Non-goals

- No support for browsers predating ES modules / dynamic `import()` entirely
  (e.g. IE11). Those need a build-time bundling strategy instead of import
  maps, which is a different architecture, not an extension of this one.
- Not a replacement for verifying actual audience browser-support
  requirements — this is only worth picking up once a consuming application
  has a concrete need for the long tail of pre-16.4 Safari / pre-108 Firefox
  / pre-89 Chrome traffic.
