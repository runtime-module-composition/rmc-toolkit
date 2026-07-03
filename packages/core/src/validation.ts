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

  for (const [sliceName, slice] of Object.entries(manifest.slices)) {
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

  return diagnostics;
};

