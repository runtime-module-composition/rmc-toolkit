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
  onLoading?: (path: string) => void;
  onError?: (error: unknown, path: string) => void;
  importer?: DynamicImporter;
};

export type RuntimeHost = {
  resolveAndMount(path: string): Promise<void>;
};

export const createRuntimeHost = (options: RuntimeHostOptions): RuntimeHost => {
  const { manifest, target, importer } = options;
  const onLoading = options.onLoading ?? ((): void => {});
  // Reuse one generic message for both "no route matched" and "import/mount
  // failed" — the default UI's job is "something's wrong", not a diagnostic
  // surface; pass a custom onError to differentiate them.
  const onError =
    options.onError ??
    ((error: unknown, path: string): void => {
      console.error(`Failed to load slice for ${path}:`, error);
      target.textContent = `Error: failed to load slice for ${path}`;
    });

  let latestToken = 0;
  let currentSpecifier: string | null = null;
  let currentModule: RuntimeModule | null = null;

  const resetAndReportError = (error: unknown, path: string): void => {
    currentModule = null;
    currentSpecifier = null;
    onError(error, path);
  };

  const resolveAndMount = async (path: string): Promise<void> => {
    const token = ++latestToken;
    const match = resolveRoute(manifest, path);

    if (!match) {
      try {
        if (currentModule) {
          await currentModule.unmount?.();
        }
      } catch (error) {
        resetAndReportError(error, path);
        return;
      }
      resetAndReportError(new Error(`No slice matches ${path}`), path);
      return;
    }

    // Same module already mounted: everything past this point is the
    // module's own responsibility, not the host's (e.g. its own internal
    // sub-routing) — so there is nothing further to do here.
    if (match.specifier === currentSpecifier) {
      return;
    }

    onLoading(path);

    try {
      const runtimeModule = unwrapDefault(
        await importModule(match.specifier, importer),
      ) as RuntimeModule;

      if (token !== latestToken) {
        return;
      }

      if (currentModule) {
        await currentModule.unmount?.();
      }

      currentSpecifier = match.specifier;
      currentModule = runtimeModule;
      await runtimeModule.mount(target, { route: match, manifest });
    } catch (error) {
      if (token !== latestToken) {
        return;
      }
      resetAndReportError(error, path);
    }
  };

  return { resolveAndMount };
};

export const notifyInternalNavigation = (path: string): void => {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
};
