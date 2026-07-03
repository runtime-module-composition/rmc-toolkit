import type {
  RuntimeCompositionDiagnostic,
  RuntimeCompositionManifest,
} from "./types.js";

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

  return diagnostics;
};
