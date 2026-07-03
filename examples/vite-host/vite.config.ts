import { defineConfig } from "vite";
import { runtimeComposition } from "@runtime-module-composition/vite";
import { manifest } from "./runtime-composition.manifest.js";

export default defineConfig({
  plugins: [
    ...runtimeComposition({
      manifest,
      environment: "development",
    }),
  ],
});
