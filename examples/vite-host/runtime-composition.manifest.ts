import { defineManifest } from "@runtime-module-composition/core";

export const manifest = defineManifest({
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
