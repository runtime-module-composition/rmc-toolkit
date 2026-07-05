# Backlog: A/B testing (variant-based module resolution)

Status: **not scheduled** — sketch only, for discussion when it becomes relevant.

## Motivation

A recurring question for a microfrontend host: can we serve module A to one
user segment and module B to another (an experiment/A-B test), on a
per-specifier basis?

Import maps already support this without needing any newer spec feature.
An import map is just a specifier → URL table computed at generation time;
`createImportMap()` ([import-map.ts](../../packages/core/src/import-map.ts))
already picks different slice URLs per `environment`
(`manifest.environments?.[environment]?.sliceOrigins`). Variant selection is
the same mechanism applied to a different dimension — "which URL does this
specifier resolve to" — not a new capability.

Two newer import-map features were considered and ruled out as not relevant:

- **`integrity`** (SRI hashes on mapped modules) — orthogonal, about
  tamper-detection, not variant routing.
- **Multiple/mergeable import maps** — only useful for the narrow case where
  variant assignment resolves *asynchronously after* initial HTML render (see
  [Deferred assignment](#deferred-assignment-edge-case) below), and even then
  it only supports binding a specifier for the first time, not changing an
  already-bound one. Firefox support is also still behind a disabled-by-default
  flag as of this writing, so it isn't a dependable primitive yet.

## Proposed approach

Extend the manifest with a variant dimension parallel to the existing
`environments` config, and resolve it the same way: server-side, before the
HTML (and its embedded import map) is generated/rendered.

### Type sketch (`types.ts`)

```ts
export type ExperimentVariant = string; // e.g. "control" | "treatment", or a variant id

export type VariantConfig = {
  sliceOrigins?: Record<string, string>;
  exactImports?: Record<string, SharedDependencyConfig>;
};

export type RuntimeCompositionManifest = {
  // ...existing fields
  experiments?: Record<
    string /* experiment name */,
    Partial<Record<ExperimentVariant, VariantConfig>>
  >;
};
```

### Resolution sketch (`import-map.ts`)

```ts
export type CreateImportMapOptions = {
  environment?: RuntimeEnvironment;
  // resolved variant assignment for this request/session, decided by the
  // caller (cookie, experiment SDK, edge worker, etc.) before calling
  // createImportMap()
  variants?: Record<string /* experiment name */, ExperimentVariant>;
};
```

`createImportMap()` would look up `manifest.experiments?.[experimentName]?.[variant]`
for each active experiment and let its `sliceOrigins`/`exactImports` override
the base resolution, using the same precedence pattern already used for
environment overrides (`slice.environments?.[environment] ?? slice.entry`).

Variant assignment itself is explicitly **out of scope** for this package —
it's a host-application/experimentation-platform concern. This package only
needs to accept an already-resolved variant id and bake it into the generated
map, exactly as it already does for `environment`.

## Deferred assignment edge case

If a host can't determine the variant synchronously at initial render (e.g.
the experiment assignment comes from an async client-side call and blocking
the page on it is unacceptable), the base import map can omit that specifier
entirely and a second `<script type="importmap">` can be injected once the
assignment resolves, binding the specifier for the first time.

This depends on browser support for mergeable import maps (Chrome 133+,
Safari 18.4+; Firefox implemented but flag-gated) and on the merge algorithm's
additive/first-write-wins rule — it only works if nothing has already bound or
resolved that specifier. It is **not** a live hot-swap mechanism: once a
specifier is bound, it cannot be rebound to a different URL later in the same
page session via this technique.

## Non-goals / limitations

- No live switching of an already-resolved specifier within a page session.
- No client-only variant assignment without a corresponding server-side (or
  pre-render) decision point — the variant must be known before the relevant
  import map is generated.
- Not a replacement for feature flags that need to change behavior *within*
  an already-loaded module; this only decides which module URL loads in the
  first place.

## Open questions

- Should variant resolution live in `@rmc-toolkit/core`, or is
  it entirely a host-application concern that only consumes `createImportMap()`'s
  existing `environment`-style hook?
- Do we want a first-class `experiments` manifest key, or is this better
  expressed by treating each variant as its own `RuntimeEnvironment`-like
  value (reusing the existing mechanism instead of adding a parallel one)?
- Should the Vite adapter need any awareness of variants, or is this purely a
  runtime/SSR-time concern outside the build step?
