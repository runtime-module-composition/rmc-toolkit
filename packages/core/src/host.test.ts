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
});
