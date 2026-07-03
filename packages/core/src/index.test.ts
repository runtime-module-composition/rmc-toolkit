import { describe, expect, test } from "vitest";
import {
  createExternalMatcher,
  createImportMap,
  defineManifest,
  resolveRoute,
  validateManifest,
} from "./index.js";

const manifest = defineManifest({
  namespace: "@acme",
  assetsOrigin: "https://assets.example.com",
  shared: {
    react: "https://esm.sh/react@19.2.4",
  },
  slices: {
    search: {
      route: "/search/*",
      specifier: "@acme/search",
      entry: "/search/index.mjs",
    },
    home: {
      route: "/",
      specifier: "@acme/home",
      entry: "/home/index.mjs",
    },
  },
});

describe("runtime composition core", () => {
  test("creates an import map from shared dependencies and slices", () => {
    expect(createImportMap(manifest)).toEqual({
      imports: {
        react: "https://esm.sh/react@19.2.4",
        "@acme/search": "https://assets.example.com/search/index.mjs",
        "@acme/home": "https://assets.example.com/home/index.mjs",
      },
    });
  });

  test("resolves wildcard routes to the owning slice", () => {
    expect(resolveRoute(manifest, "/search/routes")?.specifier).toBe(
      "@acme/search",
    );
  });

  test("matches exact routes ahead of wildcard scoring", () => {
    expect(resolveRoute(manifest, "/")?.specifier).toBe("@acme/home");
  });

  test("creates an external matcher from the manifest", () => {
    const isExternal = createExternalMatcher(manifest);

    expect(isExternal("react")).toBe(true);
    expect(isExternal("@acme/search")).toBe(true);
    expect(isExternal("@acme/anything")).toBe(true);
    expect(isExternal("lodash")).toBe(false);
  });

  test("validates the base manifest without errors", () => {
    expect(validateManifest(manifest).filter((item) => item.level === "error"))
      .toHaveLength(0);
  });
});

