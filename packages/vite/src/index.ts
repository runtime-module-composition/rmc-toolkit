import {
  createExternalMatcher,
  createImportMap,
  createImportMapBootstrapScript,
  resolveImportMapSpecifier,
  type ImportMap,
  type RuntimeCompositionManifest,
  type RuntimeEnvironment,
} from "@rmc-toolkit/core";
import type { Plugin } from "vite";

export type RuntimeCompositionViteOptions = {
  manifest: RuntimeCompositionManifest;
  environment?: RuntimeEnvironment;
  includeImportMap?: boolean;
  externalize?: boolean;
};

export const createRollupExternal = (
  manifest: RuntimeCompositionManifest,
): ((source: string) => boolean) => createExternalMatcher(manifest);

export const externalizeRuntimeComposition = ({
  manifest,
  environment,
}: RuntimeCompositionViteOptions): Plugin => {
  const isExternal = createExternalMatcher(manifest);
  let devImportMap: ImportMap | null = null;

  return {
    name: "runtime-module-composition-externalize",
    enforce: "pre",
    config() {
      return {
        optimizeDeps: {
          noDiscovery: true,
        },
      };
    },
    configResolved(config) {
      // Vite's production build (Rollup) already handles a bare specifier
      // marked `external: true` correctly — it preserves it untouched in
      // the output bundle for the browser's import map to resolve. Vite's
      // dev server does not: its import-analysis step rewrites any bare
      // specifier merely marked external into an internal /@id/<specifier>
      // placeholder request, and nothing serves that path. Only in dev do
      // we need to resolve to the real URL ourselves instead.
      if (config.command === "serve") {
        devImportMap = createImportMap(manifest, {
          environment: environment ?? "development",
        });
      }
    },
    resolveId(source) {
      if (!isExternal(source)) {
        return null;
      }

      const resolved =
        devImportMap && resolveImportMapSpecifier(devImportMap, source);

      return {
        id: resolved ?? source,
        external: true,
      };
    },
  };
};

export const includeRuntimeImportMap = ({
  manifest,
  environment = "development",
}: RuntimeCompositionViteOptions): Plugin => ({
  name: "runtime-module-composition-include-import-map",
  transformIndexHtml(html) {
    const importMap = createImportMap(manifest, { environment });
    const script = `<script type="importmap" data-runtime-module-composition>${JSON.stringify(importMap)}</script>`;
    const existingImportMap =
      /<script[^>]*type=["']importmap["'][^>]*data-runtime-module-composition[^>]*>.*?<\/script>/s;

    if (existingImportMap.test(html)) {
      return html.replace(existingImportMap, script);
    }

    return html.includes("<head>")
      ? html.replace("<head>", `<head>\n    ${script}`)
      : `${script}\n${html}`;
  },
});

export const runtimeComposition = (
  options: RuntimeCompositionViteOptions,
): Plugin[] => {
  const plugins: Plugin[] = [];

  if (options.externalize !== false) {
    plugins.push(externalizeRuntimeComposition(options));
  }

  if (options.includeImportMap !== false) {
    plugins.push(includeRuntimeImportMap(options));
  }

  return plugins;
};

export type LocalSliceOverride = {
  name: string;
  port: number;
};

export const buildLocalImportMapScript = (
  manifest: RuntimeCompositionManifest,
  localSlice: LocalSliceOverride,
): string => {
  const derivedManifest: RuntimeCompositionManifest = {
    ...manifest,
    environments: {
      ...manifest.environments,
      development: {
        ...manifest.environments?.development,
        sliceOrigins: {
          ...manifest.environments?.development?.sliceOrigins,
          [localSlice.name]: `http://localhost:${localSlice.port}`,
        },
      },
    },
  };

  return createImportMapBootstrapScript(derivedManifest, {
    environment: "development",
  });
};

export type IncludeHostedImportMapOptions = {
  manifest: RuntimeCompositionManifest;
  path?: string;
  localSlice?: LocalSliceOverride;
};

export const includeHostedImportMap = ({
  manifest,
  path = "/js/importmap.js",
  localSlice,
}: IncludeHostedImportMapOptions): Plugin => ({
  name: "runtime-module-composition-hosted-import-map",
  configureServer(server) {
    server.middlewares.use(path, (req, res, next) => {
      // Connect (which Vite's dev server middlewares are built on) mounts
      // handlers by path *prefix*: it matches any request whose pathname
      // starts with `path` and is followed by end-of-string, "/", or ".",
      // then strips the matched prefix from `req.url` before invoking the
      // handler. That means req.url here is *relative to the mount point*,
      // and a request for "/js/importmap.js.map" or
      // "/js/importmap.js/anything" also reaches this handler (as
      // req.url === "/.map" or "/anything"), not just the exact endpoint.
      // Comparing req.url against the outer `path` would never match,
      // since Connect has already removed that prefix — the only way to
      // detect "this is genuinely the exact endpoint" is to check that the
      // remaining, query-stripped req.url is empty or "/".
      const method = req.method ?? "GET";
      if (method !== "GET" && method !== "HEAD") {
        next();
        return;
      }

      const remainder = (req.url ?? "/").split("?")[0] ?? "/";
      if (remainder !== "" && remainder !== "/") {
        next();
        return;
      }

      const script = localSlice
        ? buildLocalImportMapScript(manifest, localSlice)
        : createImportMapBootstrapScript(manifest, { environment: "development" });
      res.setHeader("Content-Type", "text/javascript");
      res.end(script);
    });
  },
});

export { defineSliceBuild, type SliceBuildOptions } from "./slice-build.js";
