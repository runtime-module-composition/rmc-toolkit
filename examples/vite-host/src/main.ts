import {
  importModule,
  resolveRoute,
  unwrapDefault,
  type RuntimeModule,
} from "@rmc-toolkit/core";
import { manifest } from "../runtime-composition.manifest.js";

const bootstrap = async (): Promise<void> => {
  const match = resolveRoute(manifest, window.location.pathname);
  if (!match) {
    return;
  }

  const target = document.getElementById("app");
  if (!target) {
    return;
  }

  const runtimeModule = unwrapDefault(
    await importModule(match.specifier),
  ) as RuntimeModule;
  await runtimeModule.mount(target, { route: match, manifest });
};

void bootstrap();
