import { existsSync } from "node:fs";
import { join } from "node:path";
import type { UserConfig } from "vite";

export const resolveEntry = (cwd: string, entry?: string): string => {
  if (entry !== undefined) {
    return entry;
  }

  if (existsSync(join(cwd, "src/index.tsx"))) {
    return "src/index.tsx";
  }

  if (existsSync(join(cwd, "src/index.ts"))) {
    return "src/index.ts";
  }

  throw new Error(
    "defineSliceBuild: could not find src/index.tsx or src/index.ts. Pass an explicit `entry` option if this slice uses a non-standard layout.",
  );
};

export type SliceBuildOptions = {
  mode: string;
  devPort: number;
  sliceName: string;
  entry?: string;
};

export const defineSliceBuild = (options: SliceBuildOptions): UserConfig => {
  const resolvedEntry = resolveEntry(process.cwd(), options.entry);

  // Any mode other than "development" (production, or a custom mode) is
  // treated as a real build and gets the full library-build config below.
  if (options.mode === "development") {
    return { server: { port: options.devPort } };
  }

  return {
    preview: { cors: true },
    // Vite's library-build mode, unlike its app-build mode, doesn't
    // auto-replace process.env.NODE_ENV, so React/Vue's internal dev/prod
    // checks left a raw `process` reference in bundles loaded directly via
    // native import() in the browser, throwing `ReferenceError: process is
    // not defined` at runtime (no bundler runs afterward to catch it).
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    build: {
      // Lands the slice's own build output at the same {sliceName} path
      // segment resolveRoute()/createImportMap() already assume it will be
      // deployed at ({assetsOrigin}/{sliceName}/index.mjs) — see
      // docs/superpowers/specs/2026-07-07-slice-build-output-path-design.md.
      outDir: `dist/${options.sliceName}`,
      lib: {
        entry: resolvedEntry,
        formats: ["es"],
        fileName: () => "index.mjs",
      },
    },
  };
};
