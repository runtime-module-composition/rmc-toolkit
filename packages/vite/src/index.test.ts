import { defineManifest } from "@runtime-module-composition/core";
import { describe, expect, test } from "vitest";
import {
  buildLocalImportMapScript,
  includeHostedImportMap,
  includeRuntimeImportMap,
  runtimeComposition,
} from "./index.js";

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

type MockResponse = {
  setHeader: (name: string, value: string) => void;
  end: (chunk: string) => void;
};

type MockMiddlewareUse = (
  path: string,
  handler: (req: unknown, res: MockResponse) => void,
) => void;

const createMockServer = () => {
  const middlewares: Array<{
    path: string;
    handler: (req: unknown, res: MockResponse) => void;
  }> = [];

  const use: MockMiddlewareUse = (path, handler) => {
    middlewares.push({ path, handler });
  };

  return { server: { middlewares: { use } }, middlewares };
};

describe("includeHostedImportMap", () => {
  test("buildLocalImportMapScript overrides only the local slice's origin", () => {
    const script = buildLocalImportMapScript(manifest, {
      name: "search",
      port: 5173,
    });

    expect(script).toContain('"@acme/search/":"http://localhost:5173/"');
    expect(script).toContain('"@acme/":"https://assets.example.com/"');
  });

  test("serves the generated script from the default middleware path", () => {
    const plugin = includeHostedImportMap({ manifest });
    const { server, middlewares } = createMockServer();

    if (typeof plugin.configureServer !== "function") {
      throw new TypeError("Expected configureServer to be a function.");
    }
    (plugin.configureServer as unknown as (server: unknown) => void)(server);

    expect(middlewares).toHaveLength(1);
    expect(middlewares[0]?.path).toBe("/js/importmap.js");

    const headers: Record<string, string> = {};
    let body = "";
    const res: MockResponse = {
      setHeader: (name, value) => {
        headers[name] = value;
      },
      end: (chunk) => {
        body = chunk;
      },
    };
    middlewares[0]?.handler({}, res);

    expect(headers["Content-Type"]).toBe("text/javascript");
    expect(body).toContain('"@acme/":"https://assets.example.com/"');
  });

  test("uses a custom middleware path when provided", () => {
    const plugin = includeHostedImportMap({ manifest, path: "/custom.js" });
    const { server, middlewares } = createMockServer();

    if (typeof plugin.configureServer !== "function") {
      throw new TypeError("Expected configureServer to be a function.");
    }
    (plugin.configureServer as unknown as (server: unknown) => void)(server);

    expect(middlewares[0]?.path).toBe("/custom.js");
  });

  test("applies the localSlice override when serving the script", () => {
    const plugin = includeHostedImportMap({
      manifest,
      localSlice: { name: "search", port: 5173 },
    });
    const { server, middlewares } = createMockServer();

    if (typeof plugin.configureServer !== "function") {
      throw new TypeError("Expected configureServer to be a function.");
    }
    (plugin.configureServer as unknown as (server: unknown) => void)(server);

    let body = "";
    const res: MockResponse = {
      setHeader: () => {},
      end: (chunk) => {
        body = chunk;
      },
    };
    middlewares[0]?.handler({}, res);

    expect(body).toContain('"@acme/search/":"http://localhost:5173/"');
  });
});
