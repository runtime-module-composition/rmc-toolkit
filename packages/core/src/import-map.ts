import type {
  ImportMap,
  RuntimeCompositionManifest,
  RuntimeEnvironment,
  SharedDependencyConfig,
  SliceConfig,
} from "./types.js";
import { joinUrl } from "./manifest.js";

const resolveSharedDependencyUrl = (
  config: SharedDependencyConfig,
  environment: RuntimeEnvironment,
): string => {
  if (typeof config === "string") {
    return config;
  }

  return config.environments?.[environment] ?? config.url;
};

const resolveSliceUrl = (
  manifest: RuntimeCompositionManifest,
  slice: SliceConfig,
  environment: RuntimeEnvironment,
): string => {
  const entry = slice.environments?.[environment] ?? slice.entry;

  if (/^https?:\/\//.test(entry)) {
    return entry;
  }

  return joinUrl(manifest.assetsOrigin, entry);
};

export type CreateImportMapOptions = {
  environment?: RuntimeEnvironment;
  devDeps?: boolean;
};

const ensurePrefix = (value: string): string =>
  value.endsWith("/") ? value : `${value}/`;

const buildDepsQuery = (peerDeps: Record<string, string>): string =>
  Object.entries(peerDeps)
    .map(([name, version]) => `${name}@${version}`)
    .join(",");

const applyDevFlag = (value: string, externalDepsOrigin: string): string => {
  if (!value.startsWith(externalDepsOrigin)) {
    return value;
  }
  return value.includes("?") ? `${value}&dev` : `${value}?dev`;
};

const resolveAssetsOrigin = (
  manifest: RuntimeCompositionManifest,
  environment: RuntimeEnvironment,
): string => manifest.environments?.[environment]?.assetsOrigin ?? manifest.assetsOrigin;

const resolveExternalDepsOrigin = (
  manifest: RuntimeCompositionManifest,
  environment: RuntimeEnvironment,
): string | undefined =>
  manifest.environments?.[environment]?.externalDepsOrigin ??
  manifest.externalDepsOrigin;

export const createImportMap = (
  manifest: RuntimeCompositionManifest,
  options: CreateImportMapOptions = {},
): ImportMap => {
  const environment = options.environment ?? "production";
  const imports: Record<string, string> = {};
  const namespacePrefix = ensurePrefix(manifest.namespace);
  imports[namespacePrefix] = ensurePrefix(resolveAssetsOrigin(manifest, environment));

  const externalDepsOrigin = resolveExternalDepsOrigin(manifest, environment);
  const externalDepsPrefix = ensurePrefix(manifest.externalDepsPrefix ?? "@esm.sh/");

  if (externalDepsOrigin) {
    imports[externalDepsPrefix] = ensurePrefix(externalDepsOrigin);

    for (const entry of manifest.externalDeps ?? []) {
      const name = typeof entry === "string" ? entry : entry.name;
      const peerDeps =
        typeof entry === "string" ? manifest.defaultPeerDeps : entry.peerDeps;

      const specifier = `${externalDepsPrefix}${name}`;
      const baseUrl = joinUrl(externalDepsOrigin, name);

      imports[specifier] = peerDeps
        ? `${baseUrl}?deps=${buildDepsQuery(peerDeps)}`
        : baseUrl;
    }
  }

  for (const [specifier, config] of Object.entries(manifest.exactImports ?? {})) {
    imports[specifier] = resolveSharedDependencyUrl(config, environment);
  }

  for (const slice of Object.values(manifest.sliceOverrides ?? {})) {
    imports[slice.specifier] = resolveSliceUrl(manifest, slice, environment);
  }

  for (const [sliceName, sliceOrigin] of Object.entries(
    manifest.environments?.[environment]?.sliceOrigins ?? {},
  )) {
    imports[`${namespacePrefix}${sliceName}/`] = ensurePrefix(sliceOrigin);
  }

  if (options.devDeps && externalDepsOrigin) {
    for (const [specifier, url] of Object.entries(imports)) {
      if (!specifier.endsWith("/") && url.startsWith(externalDepsOrigin)) {
        imports[specifier] = applyDevFlag(url, externalDepsOrigin);
      }
    }
  }

  return { imports };
};
