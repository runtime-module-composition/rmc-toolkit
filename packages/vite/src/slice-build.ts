import { existsSync } from "node:fs";
import { join } from "node:path";

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
