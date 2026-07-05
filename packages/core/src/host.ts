import { importModule, unwrapDefault } from "./loader.js";
import { resolveRoute } from "./routes.js";
import type {
  DynamicImporter,
  RuntimeCompositionManifest,
  RuntimeModule,
} from "./types.js";

export type RuntimeHostOptions = {
  manifest: RuntimeCompositionManifest;
  target: Element;
  importer?: DynamicImporter;
};

export type RuntimeHost = {
  resolveAndMount(path: string): Promise<void>;
};

export const createRuntimeHost = (options: RuntimeHostOptions): RuntimeHost => {
  const { manifest, target, importer } = options;

  let currentSpecifier: string | null = null;
  let currentModule: RuntimeModule | null = null;

  const resolveAndMount = async (path: string): Promise<void> => {
    const match = resolveRoute(manifest, path);

    if (!match) {
      return;
    }

    // Same module already mounted: everything past this point is the
    // module's own responsibility, not the host's (e.g. its own internal
    // sub-routing) — so there is nothing further to do here.
    if (match.specifier === currentSpecifier) {
      return;
    }

    const runtimeModule = unwrapDefault(
      await importModule(match.specifier, importer),
    ) as RuntimeModule;

    if (currentModule) {
      await currentModule.unmount?.();
    }

    currentSpecifier = match.specifier;
    currentModule = runtimeModule;
    await runtimeModule.mount(target, { route: match, manifest });
  };

  return { resolveAndMount };
};

export const notifyInternalNavigation = (path: string): void => {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
};
