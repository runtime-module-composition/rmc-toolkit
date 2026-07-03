import { defineManifest } from "@runtime-module-composition/core";
import { describe, expect, test } from "vitest";
import { includeRuntimeImportMap, runtimeComposition } from "./index.js";

const manifest = defineManifest({
  namespace: "@acme",
  assetsOrigin: "https://assets.example.com",
  externalDepsOrigin: "https://esm.sh",
  environments: {
    development: {
      sliceOrigins: {
        search: "http://localhost:5174",
      },
    },
  },
});

describe("vite adapter", () => {
  test("includes the import map in transformed HTML", () => {
    const plugin = includeRuntimeImportMap({
      manifest,
      environment: "development",
    });

    if (typeof plugin.transformIndexHtml !== "function") {
      throw new TypeError("Expected transformIndexHtml to be a function.");
    }

    const transformIndexHtml = plugin.transformIndexHtml as (
      html: string,
    ) => string;
    const html = transformIndexHtml("<html><head></head><body></body></html>");

    expect(html).toContain('<script type="importmap" data-runtime-module-composition>');
    expect(html).toContain('"@acme/":"https://assets.example.com/"');
    expect(html).toContain('"@esm.sh/":"https://esm.sh/"');
    expect(html).toContain('"@acme/search/":"http://localhost:5174/"');
    expect(html).toContain("</head>");
  });

  test("can disable import map HTML generation in the combined plugin list", () => {
    const plugins = runtimeComposition({
      manifest,
      includeImportMap: false,
    });

    expect(plugins.map((plugin) => plugin.name)).toEqual([
      "runtime-module-composition-externalize",
    ]);
  });
});
