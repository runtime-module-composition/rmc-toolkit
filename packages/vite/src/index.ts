import {
  createExternalMatcher,
  createImportMap,
  createImportMapBootstrapScript,
  type RuntimeCompositionManifest,
  type RuntimeEnvironment,
} from "@runtime-module-composition/core";
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
}: RuntimeCompositionViteOptions): Plugin => {
  const isExternal = createExternalMatcher(manifest);

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
    resolveId(source) {
      if (!isExternal(source)) {
        return null;
      }

      return {
        id: source,
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
    server.middlewares.use(path, (_req, res) => {
      const script = localSlice
        ? buildLocalImportMapScript(manifest, localSlice)
        : createImportMapBootstrapScript(manifest, { environment: "development" });
      res.setHeader("Content-Type", "text/javascript");
      res.end(script);
    });
  },
});
