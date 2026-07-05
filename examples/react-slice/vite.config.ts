import { defineConfig } from "vite";
import { defineManifest } from "@rmc-toolkit/core";
import { createRollupExternal } from "@rmc-toolkit/vite";

const manifest = defineManifest({
  namespace: "@acme",
  assetsOrigin: "https://assets.example.com",
  externalDepsOrigin: "https://esm.sh",
});

export default defineConfig({
  build: {
    lib: {
      entry: ["src/index.ts"],
      formats: ["es"],
      fileName: () => "index.mjs",
    },
    rollupOptions: {
      external: createRollupExternal(manifest),
    },
  },
});
