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
import { jsImportMapScriptPlugin } from "vite-plugin-js-importmap-script";

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

      // `resolved` can be undefined here only if devImportMap is null (build
      // mode — see configResolved above) or if resolveImportMapSpecifier
      // can't resolve `source` against it. The latter isn't expected to be
      // reachable for a well-formed manifest: every specifier isExternal()
      // matches (namespace prefix, external-deps prefix, exactImports keys,
      // sliceOverrides specifiers) has a corresponding entry unconditionally
      // added by createImportMap, so the same prefixes/keys this matcher
      // checks are exactly what the import map also contains. The `?? source`
      // fallback exists as a safety net for that theoretical case, not
      // because it's expected to fire.
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

// Consuming HTML must declare the hosted import map as an ordinary external
// script, in this exact attribute order, for the ordering-safety plugin
// below to find and reposition it:
//
//   <script data-src-type="importmap" src="/js/importmap.js"></script>
//
// Per the HTML spec, a document's "import maps allowed" flag flips to false
// (permanently, for that page load) the moment the first module script or
// modulepreload is fetched — Vite's dev server always injects its own
// `type="module"` scripts (the HMR client, and the React refresh preamble
// when using @vitejs/plugin-react). If either of those gets prepared before
// this script tag is parsed, the import map is rejected outright (not
// merely reordered), and every bare-specifier import in the app fails. Once
// rejected, a later import map can't be reinserted to recover from it either
// — the flag never flips back to true for that page load.
//
// jsImportMapScriptPlugin() closes this by removing the tag from wherever
// it naturally sits in the document and force-reinserting it immediately
// after <head> on every dev request, rather than trusting that this
// plugin's own transformIndexHtml hook happens to run after Vite's
// internal ones (an ordering relationship Vite doesn't document or
// guarantee across versions). It also appends `?dev`/`&dev` to the src so
// the served script can detect dev mode the same way
// createImportMapBootstrapScript()'s own `?dev` detection does.
//
// Restricted to `apply: "serve"`: the plugin unconditionally appends the
// dev-flag query on every transformIndexHtml call it receives, with no
// mode-awareness of its own — the calling app is responsible for only
// wiring it in for dev, exactly as it must never run during `vite build`.
export const includeHostedImportMap = ({
  manifest,
  path = "/js/importmap.js",
  localSlice,
}: IncludeHostedImportMapOptions): Plugin[] => [
  {
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
  },
  { ...jsImportMapScriptPlugin(), apply: "serve" },
];

export { defineSliceBuild, type SliceBuildOptions } from "./slice-build.js";
