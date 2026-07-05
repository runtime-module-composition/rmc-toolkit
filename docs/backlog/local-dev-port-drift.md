# Backlog: local dev port declared twice, with no drift detection

Status: **not scheduled** — observation from reviewing the
[vite-slice-build-ergonomics design](../superpowers/specs/2026-07-04-vite-slice-build-ergonomics-design.md),
captured for later.

## Motivation

A slice's local dev port ends up declared in two independent places that must
agree, with nothing checking that they do:

- The slice's own `vite.config.ts`, e.g. `defineSliceBuild({ devPort: 5301 })`
  — this is what the slice's own `vite dev` server actually binds to.
- The consuming shell's manifest, e.g. `rmc-shell/src/manifest.ts`'s
  `environments.development.sliceOrigins: { "react-app": "http://localhost:5301" }`
  — this is what tells the shell's browser-side import map where to fetch
  that slice from (`sliceOrigins` feeds `createImportMap()`,
  [import-map.ts:105](../../packages/core/src/import-map.ts:105)).

These aren't two settings for the same resource in conflict — they're the
client and server sides of the same assumption, declared independently. If
they drift (someone changes one without the other), nothing fails at config
time. The slice's dev server comes up fine on its new port; the shell just
gets a failed or wrong fetch in the browser at runtime, with no earlier
signal pointing at the actual cause.

The duplication itself is not a design mistake — closing it would require
either the shell reading the slice's own `vite.config.ts` (cross-repo
coupling) or the slice reading the shared manifest to pick its own port
(the opposite direction), and this project deliberately keeps sub-apps
independently deployable with zero central registration. `defineSliceBuild`
explicitly declares "no manifest awareness" as a non-goal for exactly this
reason. What's missing isn't a fix to the duplication — it's anything that
makes drift between the two loud instead of silent.

## Possible approaches (not evaluated in depth)

1. **Startup reachability check in dev mode.** The shell's dev-mode import-map
   middleware (`includeHostedImportMap`/`runtimeComposition`'s
   `configureServer` hook) could ping each `sliceOrigins` URL when the shell's
   dev server starts, and log a warning (not fail) for any that don't
   respond. Turns "silent broken fetch discovered later in the browser" into
   "clear warning the moment `npm run dev` starts." Doesn't require any
   cross-repo coupling — it's a runtime probe, not a shared config source.
2. **Shared port-registry convention.** A small `ports.json` (or similar)
   that both a slice's `vite.config.ts` and the shell's manifest import,
   single-sourcing the number. Removes the duplication entirely, but
   reintroduces a light coordination artifact that's in tension with the
   zero-registration principle — would need its own justification for why
   this one exception is worth it.
3. **Deterministic port derivation.** Derive dev ports from something already
   known on both sides (e.g. a hash of the slice's namespace segment mod a
   port range) instead of hand-picking and duplicating literals. Removes the
   need to declare the number at all in the common case, at the cost of less
   predictable/readable port numbers and a fallback story for collisions.
4. **Do nothing.** Given this only affects local dev ergonomics (not
   production behavior or the module-resolution contract), it may be fine to
   leave as a "if your shell can't reach a slice locally, check both configs
   agree" troubleshooting note rather than solving it in the toolkit.

## Open questions

- Is this worth solving in `@rmc-toolkit/vite` generally, or
  is it a per-project concern that each consuming project should handle with
  its own convention?
- Would a shared port-registry file (option 2) be a reasonable, narrowly
  scoped exception to zero-registration, given it only affects local dev
  wiring and never touches production resolution?
- Is a startup reachability warning (option 1) valuable enough on its own,
  independent of whether the duplication itself ever gets addressed?
