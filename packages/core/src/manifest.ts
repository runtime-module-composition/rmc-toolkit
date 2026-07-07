import type { PackageSpecifier, RuntimeCompositionManifest } from "./types.js";

export const defineManifest = <TManifest extends RuntimeCompositionManifest>(
  manifest: TManifest,
): TManifest => manifest;

export const trimTrailingSlash = (value: string): string =>
  value.endsWith("/") ? value.slice(0, -1) : value;

export const trimLeadingSlash = (value: string): string =>
  value.startsWith("/") ? value.slice(1) : value;

export const joinUrl = (origin: string, path: string): string =>
  `${trimTrailingSlash(origin)}/${trimLeadingSlash(path)}`;

/**
 * Splits a package specifier into its base package (handling scoped
 * packages, e.g. "@radix-ui/themes") and an optional subpath (e.g.
 * "react-dom/client" -> basePackage "react-dom", subpath "client").
 */
export const splitPackageSpecifier = (name: string): PackageSpecifier => {
  const segments = name.split("/");

  if (name.startsWith("@")) {
    const scope = segments[0] ?? "";
    const packageName = segments[1] ?? "";
    const rest = segments.slice(2);
    return {
      basePackage: `${scope}/${packageName}`,
      subpath: rest.length > 0 ? rest.join("/") : null,
    };
  }

  const packageName = segments[0] ?? name;
  const rest = segments.slice(1);
  return {
    basePackage: packageName,
    subpath: rest.length > 0 ? rest.join("/") : null,
  };
};

