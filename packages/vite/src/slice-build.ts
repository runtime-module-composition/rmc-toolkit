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
  entry?: string;
};

export const defineSliceBuild = (options: SliceBuildOptions): UserConfig => {
  const resolvedEntry = resolveEntry(process.cwd(), options.entry);

  if (options.mode === "development") {
    return { server: { port: options.devPort } };
  }

  return {
    preview: { cors: true },
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    build: {
      lib: {
        entry: resolvedEntry,
        formats: ["es"],
        fileName: () => "index.mjs",
      },
    },
  };
};
