# Backlog: manifest-derived specifier constants

Status: **not scheduled** — observation from the
[component-boundary status-signal design](../superpowers/specs/2026-11-04-component-boundary-status-signal-design.md),
captured for later.

## Motivation

Every consumer-facing entry point that names a slice —
`DynamicModuleBoundary`/`InjectedModuleBoundary`'s `specifier` prop,
`useRuntimeHost`, and now `useDynamicModuleStatus` — takes a hand-typed
string literal, e.g. `"@acme/consent-client"`. The status-signal design
settled on exact string matching for that specifier (no normalization,
matching how the browser's own import map resolves it), which means two
call sites that *mean* the same slice but are spelled even slightly
differently (a typo, a stray trailing slash, copy-paste drift) silently
become two unrelated store entries — no error, just a status that never
updates because one side is watching the wrong key.

The manifest already is the single source of truth for every valid
specifier — conventional routing (`buildConventionalSpecifier`,
[routes.ts](../../packages/core/src/routes.ts)), `sliceOverrides`,
`routeOverrides`, and `exactImports` all enumerate them already. Hand-typing
the same strings again at every call site duplicates information the
toolkit already has, for no benefit, and is exactly the kind of drift this
project's manifest-as-single-source-of-truth principle exists to prevent
elsewhere.

## Possible approaches (not evaluated in depth)

1. **Generated constants.** A build step or CLI (likely in
   `@rmc-toolkit/vite`, alongside its other manifest-consuming tooling) reads
   the manifest and emits a typed object — e.g. `SPECIFIERS.consentClient` —
   so consumers never type the raw string at all. Removes the typo risk
   entirely and gets autocomplete as a side effect.
2. **Manifest-derived TypeScript type only.** A union of literal specifier
   strings generated from the manifest, used purely for compile-time
   checking against a hand-typed literal — no new runtime API, smaller
   surface, but doesn't remove the duplication itself.
3. **Runtime helper.** A core export like `specifierFor(manifest, sliceName)`
   computed at call time instead of code-generated ahead of time. Avoids a
   build step, but requires importing the manifest wherever a specifier is
   needed — today neither the boundaries nor the hook need it, by design.
4. **Do nothing.** Leave specifiers as hand-typed literals and document the
   exact-match rule clearly; treat a mismatch as a fixable mistake once
   someone notices a status that never updates.

## Open questions

- Framework-agnostic in `core`, or build-time generation in `@rmc-toolkit/vite`
  next to its other manifest tooling?
- Scope: slice specifiers only, or also `exactImports`/shared-dependency
  specifiers?
- Worth a build step now, or wait until exact-match drift actually causes a
  real incident?
- Separately raised: this and other forward-looking ideas could eventually
  be surfaced on the public docs site
  ([runtime-module-composition.dev](https://runtime-module-composition.dev))
  rather than staying repo-local — that site is externally hosted and out of
  this repo, so publishing there is a separate, later step, not something
  this backlog entry can do on its own.
