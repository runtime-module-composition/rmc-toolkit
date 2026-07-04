import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { defineSliceBuild, resolveEntry } from "./slice-build.js";

let tempDir: string | null = null;

const createTempSliceDir = (): string => {
  tempDir = mkdtempSync(join(tmpdir(), "rmc-vite-slice-build-"));
  return tempDir;
};

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("resolveEntry", () => {
  test("returns the explicit entry without touching the filesystem", () => {
    const dir = createTempSliceDir();
    expect(resolveEntry(dir, "custom/entry.ts")).toBe("custom/entry.ts");
  });

  test("prefers src/index.tsx when both .tsx and .ts exist", () => {
    const dir = createTempSliceDir();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "index.tsx"), "export default {};");
    writeFileSync(join(dir, "src", "index.ts"), "export default {};");

    expect(resolveEntry(dir)).toBe("src/index.tsx");
  });

  test("falls back to src/index.ts when only it exists", () => {
    const dir = createTempSliceDir();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "index.ts"), "export default {};");

    expect(resolveEntry(dir)).toBe("src/index.ts");
  });

  test("throws a clear error when neither conventional path exists", () => {
    const dir = createTempSliceDir();
    mkdirSync(join(dir, "src"), { recursive: true });

    expect(() => resolveEntry(dir)).toThrow(
      "defineSliceBuild: could not find src/index.tsx or src/index.ts. Pass an explicit `entry` option if this slice uses a non-standard layout.",
    );
  });
});

describe("defineSliceBuild", () => {
  test("dev mode returns only the server port", () => {
    const config = defineSliceBuild({
      mode: "development",
      devPort: 5301,
      entry: "src/index.tsx",
    });

    expect(config).toEqual({ server: { port: 5301 } });
  });

  test("build mode returns preview/define/build.lib with the resolved entry", () => {
    const config = defineSliceBuild({
      mode: "production",
      devPort: 5301,
      entry: "src/index.tsx",
    });

    expect(config.preview).toEqual({ cors: true });
    expect(config.define).toEqual({
      "process.env.NODE_ENV": JSON.stringify("production"),
    });

    const lib = config.build?.lib;
    if (!lib) {
      throw new TypeError("Expected config.build.lib to be defined.");
    }
    expect(lib.entry).toBe("src/index.tsx");
    expect(lib.formats).toEqual(["es"]);
    expect(typeof lib.fileName).toBe("function");
    if (typeof lib.fileName === "function") {
      expect(lib.fileName("es", "index")).toBe("index.mjs");
    }
  });
});
