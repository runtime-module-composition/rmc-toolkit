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
  destroy(): Promise<void>;
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
        if (token === latestToken) {
          resetAndReportError(error, path);
        }
        return;
      }
      if (token === latestToken) {
        resetAndReportError(new Error(`No slice matches ${path}`), path);
      }
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

      // Re-check after unmount: it's an arbitrary, user-authored async
      // function that can take any amount of time, so a newer call may have
      // become latest while this one was awaiting it. Without this check, a
      // slow unmount could let this call commit stale state on top of a
      // newer call's already-mounted module.
      if (token !== latestToken) {
        return;
      }

      currentSpecifier = match.specifier;
      currentModule = runtimeModule;
      // Accepted, narrower limitation: once mount() is actually called,
      // there's no clean way to cancel it if a still-newer call starts and
      // reaches its own mount() before this one finishes. Closing that would
      // require serializing all resolveAndMount() calls behind a queue/lock,
      // which is out of scope for the specific bug this token fix closes
      // (the earlier, easily-hit case of an older call clobbering a newer
      // call's already-*settled* mount).
      await runtimeModule.mount(target, { route: match, manifest });
    } catch (error) {
      if (token === latestToken) {
        resetAndReportError(error, path);
      }
    }
  };

  const destroy = async (): Promise<void> => {
    latestToken += 1;
    if (currentModule) {
      await currentModule.unmount?.();
    }
    currentModule = null;
    currentSpecifier = null;
    // Same accepted, narrower limitation as the resolveAndMount-vs-
    // resolveAndMount case above: if a resolveAndMount() call is already
    // inside its own (uninterruptible) mount() when destroy() runs, that
    // mount can still finish after this promise resolves, leaving something
    // mounted that this host's own bookkeeping no longer reflects.
  };

  return { resolveAndMount, destroy };
};

export const notifyInternalNavigation = (path: string): void => {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
};
