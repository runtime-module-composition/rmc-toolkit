import { describe, expect, test } from "vitest";
import { createImportMap, resolveImportMapSpecifier, withLocalModules } from "./import-map.js";
import { defineManifest } from "./manifest.js";

const manifest = defineManifest({
  namespace: "@acme",
  assetsOrigin: "https://assets.example.com",
  exactImports: { "@acme/ui": "https://assets.example.com/ui/index.mjs" },
});
const origin = "https://local.example.test:3000";

describe("withLocalModules", () => {
  test("appends overrides as string exactImports and keeps the originals", () => {
    const derived = withLocalModules(manifest, {
      "@acme/search/index.mjs": `${origin}/repos/search/src/index.tsx`,
    });
    expect(derived.exactImports).toEqual({
      "@acme/ui": "https://assets.example.com/ui/index.mjs",
      "@acme/search/index.mjs": `${origin}/repos/search/src/index.tsx`,
    });
    expect(manifest.exactImports).toEqual({ "@acme/ui": "https://assets.example.com/ui/index.mjs" });
  });

  test("replaces an existing exact import", () => {
    const derived = withLocalModules(manifest, { "@acme/ui": `${origin}/repos/ui/src/index.ts` });
    expect(derived.exactImports?.["@acme/ui"]).toBe(`${origin}/repos/ui/src/index.ts`);
  });

  test("leaves prefix mappings untouched; an exact key wins over the namespace prefix", () => {
    const derived = withLocalModules(manifest, {
      "@acme/search/index.mjs": `${origin}/repos/search/src/index.tsx`,
    });
    const map = createImportMap(derived, { environment: "development" });
    expect(map.imports["@acme/"]).toBe("https://assets.example.com/");
    expect(resolveImportMapSpecifier(map, "@acme/search/index.mjs")).toBe(`${origin}/repos/search/src/index.tsx`);
    expect(resolveImportMapSpecifier(map, "@acme/search/other.mjs")).toBe("https://assets.example.com/search/other.mjs");
  });

  test("throws on a non-absolute URL, naming the specifier", () => {
    expect(() => withLocalModules(manifest, { "@acme/search/index.mjs": "/repos/search/src/index.tsx" }))
      .toThrow(/@acme\/search\/index\.mjs/);
  });
});
