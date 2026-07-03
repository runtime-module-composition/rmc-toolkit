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
  externalDepsOrigin: "https://esm.sh",
});

describe("runtime composition core", () => {
  test("creates an import map from namespace and external dependency origins", () => {
    expect(createImportMap(manifest)).toEqual({
      imports: {
        "@acme/": "https://assets.example.com/",
        "@esm.sh/": "https://esm.sh/",
      },
    });
  });

  test("uses environment-specific origins and slice origins", () => {
    expect(
      createImportMap({
        ...manifest,
        environments: {
          development: {
            assetsOrigin: "http://localhost:5173/assets",
            externalDepsOrigin: "https://esm.sh",
            sliceOrigins: {
              search: "http://localhost:5174",
            },
          },
        },
      }, { environment: "development" }),
    ).toEqual({
      imports: {
        "@acme/": "http://localhost:5173/assets/",
        "@esm.sh/": "https://esm.sh/",
        "@acme/search/": "http://localhost:5174/",
      },
    });
  });

  test("resolves routes by convention without explicit slice config", () => {
    expect(resolveRoute(manifest, "/search/routes")?.specifier).toBe(
      "@acme/search/index.mjs",
    );
  });

  test("returns null for the root route unless an override is configured", () => {
    expect(resolveRoute(manifest, "/")).toBeNull();
  });

  test("supports explicit route overrides for exceptions", () => {
    const match = resolveRoute(
      {
        ...manifest,
        routes: {
          "/": "@acme/home/index.mjs",
        },
      },
      "/",
    );

    expect(match?.specifier).toBe("@acme/home/index.mjs");
  });

  test("creates an external matcher from the manifest", () => {
    const isExternal = createExternalMatcher(manifest);

    expect(isExternal("@esm.sh/react")).toBe(true);
    expect(isExternal("@acme/search/index.mjs")).toBe(true);
    expect(isExternal("@acme/anything")).toBe(true);
    expect(isExternal("lodash")).toBe(false);
  });

  test("validates the base manifest without errors", () => {
    expect(validateManifest(manifest).filter((item) => item.level === "error"))
      .toHaveLength(0);
  });
});
