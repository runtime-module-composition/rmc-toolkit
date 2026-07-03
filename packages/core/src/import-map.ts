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
};

export const createImportMap = (
  manifest: RuntimeCompositionManifest,
  options: CreateImportMapOptions = {},
): ImportMap => {
  const environment = options.environment ?? "production";
  const imports: Record<string, string> = {};

  for (const [specifier, config] of Object.entries(manifest.shared ?? {})) {
    imports[specifier] = resolveSharedDependencyUrl(config, environment);
  }

  for (const slice of Object.values(manifest.slices)) {
    imports[slice.specifier] = resolveSliceUrl(manifest, slice, environment);
  }

  return { imports };
};
