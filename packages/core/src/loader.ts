import type { DynamicImporter } from "./types.js";

export const importModule = (
  specifier: string,
  importer: DynamicImporter = (s) => import(/* @vite-ignore */ s),
): Promise<unknown> => importer(specifier);

export const unwrapDefault = (moduleNamespace: unknown): unknown =>
  moduleNamespace &&
  typeof moduleNamespace === "object" &&
  "default" in moduleNamespace
    ? (moduleNamespace as { default: unknown }).default
    : moduleNamespace;
