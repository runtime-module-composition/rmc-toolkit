import type { RuntimeCompositionManifest } from "./types.js";

export const defineManifest = <TManifest extends RuntimeCompositionManifest>(
  manifest: TManifest,
): TManifest => manifest;

export const trimTrailingSlash = (value: string): string =>
  value.endsWith("/") ? value.slice(0, -1) : value;

export const trimLeadingSlash = (value: string): string =>
  value.startsWith("/") ? value.slice(1) : value;

export const joinUrl = (origin: string, path: string): string =>
  `${trimTrailingSlash(origin)}/${trimLeadingSlash(path)}`;

