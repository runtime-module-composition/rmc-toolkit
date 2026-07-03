import type {
  RuntimeCompositionManifest,
  SharedDependencyConfig,
} from "./types.js";

const isSharedExternal = (config: SharedDependencyConfig): boolean =>
  typeof config === "string" ? true : config.external !== false;

export const listExternalSpecifiers = (
  manifest: RuntimeCompositionManifest,
): string[] => {
  const prefixes = [
    `${manifest.namespace}/`,
    manifest.externalDepsOrigin
      ? (manifest.externalDepsPrefix ?? "@esm.sh/")
      : null,
  ].filter((value): value is string => Boolean(value));

  const shared = Object.entries(manifest.shared ?? {})
    .filter(([, config]) => isSharedExternal(config))
    .map(([specifier]) => specifier);

  const slices = Object.values(manifest.slices ?? {})
    .filter((slice) => slice.external !== false)
    .map((slice) => slice.specifier);

  return [...prefixes, ...shared, ...slices];
};

export const createExternalMatcher = (
  manifest: RuntimeCompositionManifest,
): ((source: string) => boolean) => {
  const exactSpecifiers = new Set(listExternalSpecifiers(manifest));
  const namespacePrefix = `${manifest.namespace}/`;
  const externalDepsPrefix = manifest.externalDepsOrigin
    ? (manifest.externalDepsPrefix ?? "@esm.sh/")
    : null;

  return (source: string): boolean =>
    exactSpecifiers.has(source) ||
    source.startsWith(namespacePrefix) ||
    (externalDepsPrefix ? source.startsWith(externalDepsPrefix) : false);
};
