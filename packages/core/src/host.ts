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
  onReady?: (path: string) => void;
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
  const onReady = options.onReady ?? ((): void => {});
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
  // Serializes every unmount()/mount() cycle against `target`, so one
  // never runs concurrently with another — including the case where an
  // older call's own mount() is still in flight when a newer call
  // supersedes it. A call whose token is no longer latest by the time its
  // turn comes up skips its cycle entirely: that's also what gives the
  // host its coalescing behavior, since of several calls queued up behind
  // a slow cycle, only the most recent one ever actually touches the DOM.
  let cycleQueue: Promise<void> = Promise.resolve();

  const resetAndReportError = (error: unknown, path: string): void => {
    currentModule = null;
    currentSpecifier = null;
    onError(error, path);
  };

  const enqueueCycle = (token: number, cycle: () => Promise<void>): Promise<void> => {
    const turn = cycleQueue.then(() => {
      if (token !== latestToken) {
        return;
      }
      return cycle();
    });
    // The shared queue must keep flowing even when one cycle rejects —
    // only the caller awaiting this specific turn should see that.
    cycleQueue = turn.catch(() => {});
    return turn;
  };

  const resolveAndMount = async (path: string): Promise<void> => {
    const token = ++latestToken;
    const match = resolveRoute(manifest, path);

    if (!match) {
      return enqueueCycle(token, async () => {
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
      });
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

      await enqueueCycle(token, async () => {
        if (currentModule) {
          await currentModule.unmount?.();
        }

        // Re-check after unmount: a newer call may have been issued while
        // this one was awaiting it, even though that newer call is itself
        // still waiting its own turn in the queue behind this one.
        if (token !== latestToken) {
          return;
        }

        currentSpecifier = match.specifier;
        currentModule = runtimeModule;
        await runtimeModule.mount(target, { route: match, manifest });

        if (token === latestToken) {
          onReady(path);
        }
      });
    } catch (error) {
      if (token === latestToken) {
        resetAndReportError(error, path);
      }
    }
  };

  const destroy = async (): Promise<void> => {
    latestToken += 1;
    // Unlike enqueueCycle(), destroy()'s own turn always runs once it comes
    // up — it's a hard teardown, not a request that a later navigation
    // should be able to coalesce away — but it still waits in the same
    // queue so it never overlaps a cycle that's already in flight.
    const turn = cycleQueue.then(async () => {
      if (currentModule) {
        await currentModule.unmount?.();
      }
      currentModule = null;
      currentSpecifier = null;
    });
    cycleQueue = turn.catch(() => {});
    await turn;
  };

  return { resolveAndMount, destroy };
};

export const notifyInternalNavigation = (path: string): void => {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
};
