import {
  createExternalMatcher,
  createImportMap,
  type RuntimeCompositionManifest,
  type RuntimeEnvironment,
} from "@runtime-module-composition/core";
import type { Plugin } from "vite";

export type RuntimeCompositionViteOptions = {
  manifest: RuntimeCompositionManifest;
  environment?: RuntimeEnvironment;
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

export const injectRuntimeImportMap = ({
  manifest,
  environment = "development",
}: RuntimeCompositionViteOptions): Plugin => ({
  name: "runtime-module-composition-import-map",
  transformIndexHtml(html) {
    const importMap = createImportMap(manifest, { environment });
    const script = `<script type="importmap">${JSON.stringify(importMap)}</script>`;

    return html.includes("<head>")
      ? html.replace("<head>", `<head>\n    ${script}`)
      : `${script}\n${html}`;
  },
});

