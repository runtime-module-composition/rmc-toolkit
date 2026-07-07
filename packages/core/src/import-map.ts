import type {
  ExternalDepEntry,
  ImportMap,
  RuntimeCompositionManifest,
  RuntimeEnvironment,
  SharedDependencyConfig,
  SliceConfig,
} from "./types.js";
import { joinUrl, splitPackageSpecifier } from "./manifest.js";

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

type VersionIndexEntry = { version: string; entryName: string };

/**
 * One basePackage -> version lookup built from every externalDeps entry.
 * If two entries share a basePackage but declare different versions, the
 * FIRST-declared one wins here (used only for resolving other entries'
 * peerDeps references) — each entry's own URL is still built from its own
 * declared version regardless of what wins this lookup, so a genuine
 * conflict stays visible in the generated map rather than being silently
 * normalized away. See validateManifest for the diagnostic that surfaces
 * this class of mistake.
 */
const buildVersionIndex = (
  entries: ExternalDepEntry[],
): Map<string, VersionIndexEntry> => {
  const index = new Map<string, VersionIndexEntry>();

  for (const entry of entries) {
    const { basePackage } = splitPackageSpecifier(entry.name);
    if (!index.has(basePackage)) {
      index.set(basePackage, { version: entry.version, entryName: entry.name });
    }
  }

  return index;
};

/** Inserts `@version` right after the base package, preserving any subpath:
 *  "react-dom/client" + "19.2.4" -> ".../react-dom@19.2.4/client". */
const buildVersionedUrl = (origin: string, name: string, version: string): string => {
  const { basePackage, subpath } = splitPackageSpecifier(name);
  const versionedPath = subpath
    ? `${basePackage}@${version}/${subpath}`
    : `${basePackage}@${version}`;
  return joinUrl(origin, versionedPath);
};

const resolvePeerNames = (
  entry: ExternalDepEntry,
  defaultPeerDeps: string[] | undefined,
): string[] => {
  if (entry.peerDeps === false) {
    return [];
  }
  return entry.peerDeps ?? defaultPeerDeps ?? [];
};

/** A peer name with no matching externalDeps entry is silently omitted —
 *  createImportMap never throws; validateManifest is where that mistake
 *  gets surfaced, at warning level. */
const buildDepsQuery = (
  peerNames: string[],
  versionIndex: Map<string, VersionIndexEntry>,
): string =>
  peerNames
    .map((peerName) => {
      const resolved = versionIndex.get(peerName);
      return resolved ? `${peerName}@${resolved.version}` : null;
    })
    .filter((value): value is string => value !== null)
    .join(",");

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

    const externalDeps = manifest.externalDeps ?? [];
    const versionIndex = buildVersionIndex(externalDeps);

    for (const entry of externalDeps) {
      const specifier = `${externalDepsPrefix}${entry.name}`;
      const baseUrl = buildVersionedUrl(externalDepsOrigin, entry.name, entry.version);
      const peerNames = resolvePeerNames(entry, manifest.defaultPeerDeps);
      const depsQuery = buildDepsQuery(peerNames, versionIndex);

      imports[specifier] = depsQuery ? `${baseUrl}?deps=${depsQuery}` : baseUrl;
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

// Note: options.devDeps has no effect here — dev-mode is always resolved at
// runtime via the generated script's own `?dev` detection, not baked in here.
export const createImportMapBootstrapScript = (
  manifest: RuntimeCompositionManifest,
  options: CreateImportMapOptions = {},
): string => {
  const environment = options.environment ?? "production";
  const { imports } = createImportMap(manifest, { environment });
  const externalDepsOrigin = resolveExternalDepsOrigin(manifest, environment) ?? "";

  return `(function () {
  var importMap = ${JSON.stringify({ imports })};
  var externalDepsOrigin = ${JSON.stringify(externalDepsOrigin)};

  var currentScript = document.currentScript;
  var isDev = false;
  if (currentScript) {
    var scriptUrl = new URL(currentScript.src, window.location.origin);
    isDev = scriptUrl.searchParams.has("dev");
  }

  var addDevFlag = function (specifier, value) {
    if (
      !isDev ||
      specifier.slice(-1) === "/" ||
      !externalDepsOrigin ||
      typeof value !== "string" ||
      value.indexOf(externalDepsOrigin) !== 0
    ) {
      return value;
    }
    return value.indexOf("?") !== -1 ? value + "&dev" : value + "?dev";
  };

  var adjustedImports = {};
  Object.keys(importMap.imports).forEach(function (specifier) {
    adjustedImports[specifier] = addDevFlag(specifier, importMap.imports[specifier]);
  });

  var script = document.createElement("script");
  script.type = "importmap";
  script.textContent = JSON.stringify({ imports: adjustedImports });
  document.head.appendChild(script);
})();
`;
};
