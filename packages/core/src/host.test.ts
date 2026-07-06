// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";
import { defineManifest } from "./manifest.js";
import type { RuntimeModule } from "./types.js";
import { createRuntimeHost, notifyInternalNavigation } from "./host.js";

const manifest = defineManifest({
  namespace: "@acme",
  assetsOrigin: "https://assets.example.com",
  sliceOverrides: {
    search: { route: "/search/*", specifier: "@acme/search/index.mjs", entry: "index.mjs" },
    cart: { route: "/cart/*", specifier: "@acme/cart/index.mjs", entry: "index.mjs" },
    wishlist: { route: "/wishlist/*", specifier: "@acme/wishlist/index.mjs", entry: "index.mjs" },
  },
});

const createMockModule = (): RuntimeModule & {
  mount: ReturnType<typeof vi.fn>;
  unmount: ReturnType<typeof vi.fn>;
} => ({
  mount: vi.fn(async () => {}),
  unmount: vi.fn(async () => {}),
});

describe("notifyInternalNavigation", () => {
  test("pushes the given path and dispatches a popstate event", () => {
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    const popstateListener = vi.fn();
    window.addEventListener("popstate", popstateListener);

    notifyInternalNavigation("/search/detail");

    expect(pushStateSpy).toHaveBeenCalledWith({}, "", "/search/detail");
    expect(popstateListener).toHaveBeenCalledTimes(1);

    window.removeEventListener("popstate", popstateListener);
    pushStateSpy.mockRestore();
  });
});

describe("createRuntimeHost", () => {
  test("resolves a route, imports the module, and mounts it with route + manifest context", async () => {
    const searchModule = createMockModule();
    const importer = vi.fn(async () => ({ default: searchModule }));
    const target = document.createElement("div");

    const host = createRuntimeHost({ manifest, target, importer });
    await host.resolveAndMount("/search");

    expect(importer).toHaveBeenCalledWith("@acme/search/index.mjs");
    expect(searchModule.mount).toHaveBeenCalledTimes(1);
    const [mountTarget, mountContext] = searchModule.mount.mock.calls[0] as [
      Element,
      { route: unknown; manifest: unknown },
    ];
    expect(mountTarget).toBe(target);
    expect(mountContext.manifest).toBe(manifest);
    expect((mountContext.route as { specifier: string }).specifier).toBe(
      "@acme/search/index.mjs",
    );
  });

  test("unmounts the previous module before mounting a module for a different specifier", async () => {
    const searchModule = createMockModule();
    const cartModule = createMockModule();
    const importer = vi.fn(async (specifier: string) => ({
      default: specifier === "@acme/search/index.mjs" ? searchModule : cartModule,
    }));
    const target = document.createElement("div");

    const host = createRuntimeHost({ manifest, target, importer });
    await host.resolveAndMount("/search");
    await host.resolveAndMount("/cart");

    expect(searchModule.unmount).toHaveBeenCalledTimes(1);
    expect(cartModule.mount).toHaveBeenCalledTimes(1);
  });

  test("navigating to the same specifier again is a no-op", async () => {
    const searchModule = createMockModule();
    const importer = vi.fn(async () => ({ default: searchModule }));
    const target = document.createElement("div");

    const host = createRuntimeHost({ manifest, target, importer });
    await host.resolveAndMount("/search");
    await host.resolveAndMount("/search/results");

    expect(searchModule.mount).toHaveBeenCalledTimes(1);
    expect(searchModule.unmount).not.toHaveBeenCalled();
  });

  test("calls onError with a descriptive message when no route matches", async () => {
    const onError = vi.fn();
    const target = document.createElement("div");
    const importer = vi.fn();

    const host = createRuntimeHost({ manifest, target, importer, onError });
    await host.resolveAndMount("/");

    expect(importer).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    const [error, path] = onError.mock.calls[0] as [unknown, string];
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("No slice matches /");
    expect(path).toBe("/");
  });

  test("default onError logs to console.error and writes a message into target", async () => {
    const target = document.createElement("div");
    const importer = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const host = createRuntimeHost({ manifest, target, importer });
    await host.resolveAndMount("/");

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(target.textContent).toBe("Error: failed to load slice for /");

    consoleErrorSpy.mockRestore();
  });

  test("calls onError when the importer rejects, and resets state so a later navigation isn't blocked", async () => {
    const onError = vi.fn();
    const target = document.createElement("div");
    const importer = vi.fn<(specifier: string) => Promise<unknown>>(async () => {
      throw new Error("network failure");
    });

    const host = createRuntimeHost({ manifest, target, importer, onError });
    await host.resolveAndMount("/search");

    expect(onError).toHaveBeenCalledWith(new Error("network failure"), "/search");

    const searchModule = createMockModule();
    importer.mockImplementation(async () => ({ default: searchModule }));
    await host.resolveAndMount("/search");

    expect(searchModule.mount).toHaveBeenCalledTimes(1);
  });

  test("calls onError when mount() throws", async () => {
    const onError = vi.fn();
    const target = document.createElement("div");
    const failingModule: RuntimeModule = {
      mount: vi.fn(async () => {
        throw new Error("mount blew up");
      }),
    };
    const importer = vi.fn(async () => ({ default: failingModule }));

    const host = createRuntimeHost({ manifest, target, importer, onError });
    await host.resolveAndMount("/search");

    expect(onError).toHaveBeenCalledWith(new Error("mount blew up"), "/search");
  });

  test("calls onLoading with the path before importing a new module, but not for a same-specifier no-op", async () => {
    const onLoading = vi.fn();
    const searchModule = createMockModule();
    const importer = vi.fn(async () => ({ default: searchModule }));
    const target = document.createElement("div");

    const host = createRuntimeHost({ manifest, target, importer, onLoading });
    await host.resolveAndMount("/search");
    await host.resolveAndMount("/search/results");

    expect(onLoading).toHaveBeenCalledTimes(1);
    expect(onLoading).toHaveBeenCalledWith("/search");
  });

  test("calls onReady with the path after a successful mount", async () => {
    const onReady = vi.fn();
    const searchModule = createMockModule();
    const importer = vi.fn(async () => ({ default: searchModule }));
    const target = document.createElement("div");

    const host = createRuntimeHost({ manifest, target, importer, onReady });
    await host.resolveAndMount("/search");

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith("/search");
  });

  test("does not call onReady for a stale call that loses the race", async () => {
    const onReady = vi.fn();
    const searchModule = createMockModule();
    const cartModule = createMockModule();
    const target = document.createElement("div");

    let resolveSearchImport: (value: { default: RuntimeModule }) => void;
    const searchImportPromise = new Promise<{ default: RuntimeModule }>((resolve) => {
      resolveSearchImport = resolve;
    });

    const importer = vi.fn(async (specifier: string) => {
      if (specifier === "@acme/search/index.mjs") {
        return searchImportPromise;
      }
      return { default: cartModule };
    });

    const host = createRuntimeHost({ manifest, target, importer, onReady });

    const firstCall = host.resolveAndMount("/search");
    const secondCall = host.resolveAndMount("/cart");

    await secondCall;
    resolveSearchImport!({ default: searchModule });
    await firstCall;

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith("/cart");
  });

  test("calls onError (not the 'no slice matches' message) when unmounting during a no-match navigation itself throws", async () => {
    const onError = vi.fn();
    const target = document.createElement("div");
    const searchModule: RuntimeModule = {
      mount: vi.fn(async () => {}),
      unmount: vi.fn(async () => {
        throw new Error("unmount blew up");
      }),
    };
    const importer = vi.fn(async () => ({ default: searchModule }));

    const host = createRuntimeHost({ manifest, target, importer, onError });
    await host.resolveAndMount("/search");
    await host.resolveAndMount("/");

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(new Error("unmount blew up"), "/");
  });

  test("discards a stale import: only the last-requested module ends up mounted", async () => {
    const searchModule = createMockModule();
    const cartModule = createMockModule();
    const target = document.createElement("div");

    let resolveSearchImport: (value: { default: RuntimeModule }) => void;
    const searchImportPromise = new Promise<{ default: RuntimeModule }>((resolve) => {
      resolveSearchImport = resolve;
    });

    const importer = vi.fn(async (specifier: string) => {
      if (specifier === "@acme/search/index.mjs") {
        return searchImportPromise;
      }
      return { default: cartModule };
    });

    const host = createRuntimeHost({ manifest, target, importer });

    const firstCall = host.resolveAndMount("/search");
    const secondCall = host.resolveAndMount("/cart");

    await secondCall;
    expect(cartModule.mount).toHaveBeenCalledTimes(1);

    resolveSearchImport!({ default: searchModule });
    await firstCall;

    expect(searchModule.mount).not.toHaveBeenCalled();
    expect(searchModule.unmount).not.toHaveBeenCalled();
    expect(cartModule.unmount).not.toHaveBeenCalled();
  });

  test("discards a stale call even when a newer call starts while this call is still awaiting its own unmount()", async () => {
    const target = document.createElement("div");
    const initialModule = createMockModule();
    const staleModule = createMockModule();
    const winningModule = createMockModule();

    let resolveUnmount: () => void;
    const unmountPromise = new Promise<void>((resolve) => {
      resolveUnmount = resolve;
    });
    initialModule.unmount.mockImplementation(() => unmountPromise);

    const importer = vi.fn(async (specifier: string) => {
      if (specifier === "@acme/search/index.mjs") {
        return { default: initialModule };
      }
      if (specifier === "@acme/cart/index.mjs") {
        return { default: staleModule };
      }
      return { default: winningModule };
    });

    const host = createRuntimeHost({ manifest, target, importer });
    await host.resolveAndMount("/search");

    // Stale call: its own import (cart) resolves immediately, so it passes
    // the post-import staleness check while it's still the latest call, then
    // blocks on unmounting `initialModule` (the shared, manually-controlled
    // promise below).
    const staleCall = host.resolveAndMount("/cart");
    await vi.waitFor(() => {
      expect(initialModule.unmount).toHaveBeenCalled();
    });

    // A newer call starts and targets a third slice while the stale call is
    // still awaiting that same unmount().
    const winningCall = host.resolveAndMount("/wishlist");

    resolveUnmount!();
    await Promise.all([staleCall, winningCall]);

    expect(staleModule.mount).not.toHaveBeenCalled();
    expect(winningModule.mount).toHaveBeenCalledTimes(1);
  });

  test("destroy() unmounts the current module and resets state", async () => {
    const searchModule = createMockModule();
    const importer = vi.fn(async () => ({ default: searchModule }));
    const target = document.createElement("div");

    const host = createRuntimeHost({ manifest, target, importer });
    await host.resolveAndMount("/search");
    await host.destroy();

    expect(searchModule.unmount).toHaveBeenCalledTimes(1);

    await host.resolveAndMount("/search");
    expect(searchModule.mount).toHaveBeenCalledTimes(2);
  });

  test("destroy() invalidates an in-flight resolveAndMount call", async () => {
    const searchModule = createMockModule();
    const target = document.createElement("div");

    let resolveImport: (value: { default: RuntimeModule }) => void;
    const importPromise = new Promise<{ default: RuntimeModule }>((resolve) => {
      resolveImport = resolve;
    });
    const importer = vi.fn(async () => importPromise);

    const host = createRuntimeHost({ manifest, target, importer });
    const pendingCall = host.resolveAndMount("/search");

    await host.destroy();
    resolveImport!({ default: searchModule });
    await pendingCall;

    expect(searchModule.mount).not.toHaveBeenCalled();
  });
});
