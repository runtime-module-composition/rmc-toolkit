import type {
  RuntimeCompositionManifest,
  SharedDependencyConfig,
} from "./types.js";
import { trimTrailingSlash } from "./manifest.js";

const isSharedExternal = (config: SharedDependencyConfig): boolean =>
  typeof config === "string" ? true : config.external !== false;

export const listExternalSpecifiers = (
  manifest: RuntimeCompositionManifest,
): string[] => {
  const prefixes = [
    `${trimTrailingSlash(manifest.namespace)}/`,
    manifest.externalDepsOrigin
      ? (manifest.externalDepsPrefix ?? "@esm.sh/")
      : null,
  ].filter((value): value is string => Boolean(value));

  const exactImportSpecifiers = Object.entries(manifest.exactImports ?? {})
    .filter(([, config]) => isSharedExternal(config))
    .map(([specifier]) => specifier);

  const sliceOverrideSpecifiers = Object.values(manifest.sliceOverrides ?? {})
    .filter((slice) => slice.external !== false)
    .map((slice) => slice.specifier);

  return [...prefixes, ...exactImportSpecifiers, ...sliceOverrideSpecifiers];
};

export const createExternalMatcher = (
  manifest: RuntimeCompositionManifest,
): ((source: string) => boolean) => {
  const exactSpecifiers = new Set(listExternalSpecifiers(manifest));
  const namespacePrefix = `${trimTrailingSlash(manifest.namespace)}/`;
  const externalDepsPrefix = manifest.externalDepsOrigin
    ? (manifest.externalDepsPrefix ?? "@esm.sh/")
    : null;

  return (source: string): boolean =>
    exactSpecifiers.has(source) ||
    source.startsWith(namespacePrefix) ||
    (externalDepsPrefix ? source.startsWith(externalDepsPrefix) : false);
};
