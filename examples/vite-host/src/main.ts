import { loadRuntimeModule, resolveRoute } from "@runtime-module-composition/core";
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

  const runtimeModule = await loadRuntimeModule(match.specifier);
  await runtimeModule.mount(target, { route: match, manifest });
};

void bootstrap();
