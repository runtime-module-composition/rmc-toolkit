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

  test("beats a sliceOverrides entry with the same specifier and keeps its route", () => {
    const withSlice = defineManifest({
      namespace: "@acme",
      assetsOrigin: "https://assets.example.com",
      sliceOverrides: {
        search: {
          route: "/search",
          specifier: "@acme/search/index.mjs",
          entry: "search/custom.mjs",
          environments: { development: "https://dev.example.com/search.mjs" },
        },
      },
    });
    const derived = withLocalModules(withSlice, {
      "@acme/search/index.mjs": `${origin}/repos/search/src/index.tsx`,
    });
    const map = createImportMap(derived, { environment: "development" });
    expect(map.imports["@acme/search/index.mjs"]).toBe(`${origin}/repos/search/src/index.tsx`);
    expect(derived.sliceOverrides?.search?.route).toBe("/search");
    expect(withSlice.sliceOverrides?.search?.entry).toBe("search/custom.mjs");
  });

  test("throws on a prefix-style key ending in a slash, naming the key", () => {
    expect(() => withLocalModules(manifest, { "@acme/search/": `${origin}/repos/search/src/` }))
      .toThrow(/@acme\/search\//);
  });

  test("throws on a non-absolute URL, naming the specifier", () => {
    expect(() => withLocalModules(manifest, { "@acme/search/index.mjs": "/repos/search/src/index.tsx" }))
      .toThrow(/@acme\/search\/index\.mjs/);
  });
});
