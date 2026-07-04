import { describe, expect, test } from "vitest";
import {
  createExternalMatcher,
  createImportMap,
  createImportMapBootstrapScript,
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
      createImportMap(
        {
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
        },
        { environment: "development" },
      ),
    ).toEqual({
      imports: {
        "@acme/": "http://localhost:5173/assets/",
        "@esm.sh/": "https://esm.sh/",
        "@acme/search/": "http://localhost:5174/",
      },
    });
  });

  test("includes exactImports entries in the generated import map", () => {
    expect(
      createImportMap({
        ...manifest,
        exactImports: {
          react: "https://esm.sh/react@19.2.4",
        },
      }),
    ).toEqual({
      imports: {
        "@acme/": "https://assets.example.com/",
        "@esm.sh/": "https://esm.sh/",
        react: "https://esm.sh/react@19.2.4",
      },
    });
  });

  test("generates externalDeps entries with defaultPeerDeps applied to bare strings", () => {
    expect(
      createImportMap({
        ...manifest,
        externalDeps: ["zustand"],
        defaultPeerDeps: { react: "19.2.4" },
      }),
    ).toEqual({
      imports: {
        "@acme/": "https://assets.example.com/",
        "@esm.sh/": "https://esm.sh/",
        "@esm.sh/zustand": "https://esm.sh/zustand?deps=react@19.2.4",
      },
    });
  });

  test("supports externalDeps entries that opt out of peerDeps", () => {
    expect(
      createImportMap({
        ...manifest,
        externalDeps: [{ name: "date-fns", peerDeps: false }],
        defaultPeerDeps: { react: "19.2.4" },
      }),
    ).toEqual({
      imports: {
        "@acme/": "https://assets.example.com/",
        "@esm.sh/": "https://esm.sh/",
        "@esm.sh/date-fns": "https://esm.sh/date-fns",
      },
    });
  });

  test("supports externalDeps entries with a custom peerDeps override", () => {
    expect(
      createImportMap({
        ...manifest,
        externalDeps: [
          {
            name: "@radix-ui/themes",
            peerDeps: { react: "19.2.4", "react-dom": "19.2.4/client" },
          },
        ],
        defaultPeerDeps: { react: "19.2.4" },
      }),
    ).toEqual({
      imports: {
        "@acme/": "https://assets.example.com/",
        "@esm.sh/": "https://esm.sh/",
        "@esm.sh/@radix-ui/themes":
          "https://esm.sh/@radix-ui/themes?deps=react@19.2.4,react-dom@19.2.4/client",
      },
    });
  });

  test("devDeps appends ?dev to exact external entries but not the catch-all prefix", () => {
    expect(
      createImportMap(
        {
          ...manifest,
          externalDeps: ["zustand"],
          defaultPeerDeps: { react: "19.2.4" },
        },
        { devDeps: true },
      ),
    ).toEqual({
      imports: {
        "@acme/": "https://assets.example.com/",
        "@esm.sh/": "https://esm.sh/",
        "@esm.sh/zustand": "https://esm.sh/zustand?deps=react@19.2.4&dev",
      },
    });
  });

  test("bare-string externalDeps entries resolve with no ?deps= query when defaultPeerDeps is unset", () => {
    expect(
      createImportMap({
        ...manifest,
        externalDeps: ["zustand"],
      }),
    ).toEqual({
      imports: {
        "@acme/": "https://assets.example.com/",
        "@esm.sh/": "https://esm.sh/",
        "@esm.sh/zustand": "https://esm.sh/zustand",
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

  test("supports explicit routeOverrides for exceptions", () => {
    const match = resolveRoute(
      {
        ...manifest,
        routeOverrides: {
          "/": "@acme/home/index.mjs",
        },
      },
      "/",
    );

    expect(match?.specifier).toBe("@acme/home/index.mjs");
  });

  test("supports sliceOverrides for slices outside the entryFile convention", () => {
    const match = resolveRoute(
      {
        ...manifest,
        sliceOverrides: {
          legacy: {
            route: "/legacy/*",
            specifier: "@acme/legacy",
            entry: "/legacy/index.mjs",
          },
        },
      },
      "/legacy/anything",
    );

    expect(match?.specifier).toBe("@acme/legacy");
  });

  test("creates an external matcher from the manifest", () => {
    const isExternal = createExternalMatcher(manifest);

    expect(isExternal("@esm.sh/react")).toBe(true);
    expect(isExternal("@acme/search/index.mjs")).toBe(true);
    expect(isExternal("@acme/anything")).toBe(true);
    expect(isExternal("lodash")).toBe(false);
  });

  test("external matcher also matches exactImports and sliceOverrides specifiers", () => {
    const isExternal = createExternalMatcher({
      ...manifest,
      exactImports: {
        react: "https://esm.sh/react@19.2.4",
      },
      sliceOverrides: {
        legacy: {
          route: "/legacy/*",
          specifier: "@vendor/legacy",
          entry: "/legacy/index.mjs",
        },
      },
    });

    expect(isExternal("react")).toBe(true);
    expect(isExternal("@vendor/legacy")).toBe(true);
    expect(isExternal("lodash")).toBe(false);
  });

  test("validates the base manifest without errors", () => {
    expect(
      validateManifest(manifest).filter((item) => item.level === "error"),
    ).toHaveLength(0);
  });

  test("createImportMapBootstrapScript generates valid, parseable JavaScript", () => {
    const script = createImportMapBootstrapScript(manifest);
    expect(() => new Function(script)).not.toThrow();
  });

  test("createImportMapBootstrapScript embeds the computed import map", () => {
    const script = createImportMapBootstrapScript(manifest);
    expect(script).toContain('"@acme/":"https://assets.example.com/"');
    expect(script).toContain('"@esm.sh/":"https://esm.sh/"');
  });

  test("createImportMapBootstrapScript embeds the manifest's own external dependency configuration, not hardcoded esm.sh defaults", () => {
    const script = createImportMapBootstrapScript({
      ...manifest,
      externalDepsOrigin: "https://cdn.example.org",
      externalDepsPrefix: "@cdn/",
    });
    expect(script).toContain("https://cdn.example.org");
    expect(script).not.toContain("esm.sh");
  });

  test("createImportMapBootstrapScript injects an importmap script via document.head.appendChild", () => {
    const script = createImportMapBootstrapScript(manifest);
    expect(script).toContain("document.head.appendChild(script)");
    expect(script).toContain('script.type = "importmap"');
  });
});
