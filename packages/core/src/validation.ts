import type {
  ExternalDepEntry,
  RuntimeCompositionDiagnostic,
  RuntimeCompositionManifest,
} from "./types.js";
import { splitPackageSpecifier } from "./manifest.js";

export const validateManifest = (
  manifest: RuntimeCompositionManifest,
): RuntimeCompositionDiagnostic[] => {
  const diagnostics: RuntimeCompositionDiagnostic[] = [];

  if (!manifest.namespace.startsWith("@")) {
    diagnostics.push({
      level: "warning",
      code: "namespace-format",
      message: "Manifest namespace should be a bare package scope, e.g. @acme.",
    });
  }

  if (!/^https?:\/\//.test(manifest.assetsOrigin)) {
    diagnostics.push({
      level: "error",
      code: "assets-origin-url",
      message: "assetsOrigin must be an absolute HTTP(S) URL.",
    });
  }

  if (
    manifest.externalDepsOrigin &&
    !/^https?:\/\//.test(manifest.externalDepsOrigin)
  ) {
    diagnostics.push({
      level: "error",
      code: "external-deps-origin-url",
      message: "externalDepsOrigin must be an absolute HTTP(S) URL.",
    });
  }

  if (
    manifest.externalDepsPrefix &&
    !manifest.externalDepsPrefix.endsWith("/")
  ) {
    diagnostics.push({
      level: "warning",
      code: "external-deps-prefix-format",
      message: "externalDepsPrefix should end with / for import-map prefix matching.",
    });
  }

  for (const [sliceName, slice] of Object.entries(manifest.sliceOverrides ?? {})) {
    if (!slice.specifier.startsWith(`${manifest.namespace}/`)) {
      diagnostics.push({
        level: "warning",
        code: "slice-specifier-namespace",
        message: `Slice "${sliceName}" specifier should start with ${manifest.namespace}/.`,
      });
    }

    if (!slice.entry.endsWith(".mjs") && !/^https?:\/\//.test(slice.entry)) {
      diagnostics.push({
        level: "warning",
        code: "slice-entry-extension",
        message: `Slice "${sliceName}" entry should usually point to an ESM .mjs asset.`,
      });
    }
  }

  for (const [route, override] of Object.entries(manifest.routeOverrides ?? {})) {
    const specifier = typeof override === "string" ? override : override.specifier;

    if (!route.startsWith("/")) {
      diagnostics.push({
        level: "warning",
        code: "route-override-format",
        message: `Route override "${route}" should start with /.`,
      });
    }

    if (!specifier.startsWith(`${manifest.namespace}/`)) {
      diagnostics.push({
        level: "warning",
        code: "route-override-specifier-namespace",
        message: `Route override "${route}" specifier should start with ${manifest.namespace}/.`,
      });
    }
  }

  const externalDeps = manifest.externalDeps ?? [];
  const entriesByBasePackage = new Map<string, ExternalDepEntry[]>();

  for (const entry of externalDeps) {
    const { basePackage } = splitPackageSpecifier(entry.name);
    const group = entriesByBasePackage.get(basePackage) ?? [];
    group.push(entry);
    entriesByBasePackage.set(basePackage, group);
  }

  for (const [basePackage, group] of entriesByBasePackage) {
    const distinctVersions = new Set(group.map((entry) => entry.version));

    if (distinctVersions.size > 1) {
      diagnostics.push({
        level: "warning",
        code: "external-deps-version-conflict",
        message: `externalDeps entries ${group
          .map((entry) => `"${entry.name}"@${entry.version}`)
          .join(", ")} all resolve to package "${basePackage}" but declare different versions.`,
      });
    }
  }

  for (const entry of externalDeps) {
    const peerNames =
      entry.peerDeps === false
        ? []
        : (entry.peerDeps ?? manifest.defaultPeerDeps ?? []);

    for (const peerName of peerNames) {
      if (!entriesByBasePackage.has(peerName)) {
        diagnostics.push({
          level: "warning",
          code: "external-deps-unresolvable-peer",
          message: `externalDeps entry "${entry.name}" lists peer dependency "${peerName}", but no externalDeps entry declares a version for "${peerName}".`,
        });
      }
    }
  }

  return diagnostics;
};
