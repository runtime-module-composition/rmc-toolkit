// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";
import { defineManifest } from "./manifest.js";
import type { RuntimeModule } from "./types.js";
import {
  createRuntimeHostObservable,
  type RuntimeHostStatus,
} from "./host-observable.js";

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

describe("createRuntimeHostObservable", () => {
  test("starts with an idle status", () => {
    const target = document.createElement("div");
    const observable = createRuntimeHostObservable({ manifest, target });

    expect(observable.getSnapshot()).toEqual({ type: "idle" });
  });

  test("transitions loading -> ready on a successful next() call", async () => {
    const searchModule = createMockModule();
    const importer = vi.fn(async () => ({ default: searchModule }));
    const target = document.createElement("div");
    const statuses: RuntimeHostStatus[] = [];

    const observable = createRuntimeHostObservable({ manifest, target, importer });
    observable.subscribe((status) => statuses.push(status));

    observable.next("/search");
    await vi.waitFor(() => {
      expect(observable.getSnapshot()).toEqual({ type: "ready", path: "/search" });
    });

    expect(statuses).toEqual([
      { type: "loading", path: "/search" },
      { type: "ready", path: "/search" },
    ]);
    expect(searchModule.mount).toHaveBeenCalledTimes(1);
  });

  test("transitions to error when no route matches", async () => {
    const target = document.createElement("div");
    const importer = vi.fn();
    const observable = createRuntimeHostObservable({ manifest, target, importer });

    observable.next("/");
    await vi.waitFor(() => {
      expect(observable.getSnapshot().type).toBe("error");
    });

    const status = observable.getSnapshot();
    if (status.type !== "error") throw new Error("expected error status");
    expect(status.path).toBe("/");
    expect(status.error).toBeInstanceOf(Error);
  });

  test("transitions to error when the importer rejects", async () => {
    const target = document.createElement("div");
    const importer = vi.fn(async () => {
      throw new Error("network failure");
    });
    const observable = createRuntimeHostObservable({ manifest, target, importer });

    observable.next("/search");
    await vi.waitFor(() => {
      expect(observable.getSnapshot().type).toBe("error");
    });
  });

  test("notifies multiple independent subscribers identically", async () => {
    const searchModule = createMockModule();
    const importer = vi.fn(async () => ({ default: searchModule }));
    const target = document.createElement("div");
    const first: RuntimeHostStatus[] = [];
    const second: RuntimeHostStatus[] = [];

    const observable = createRuntimeHostObservable({ manifest, target, importer });
    observable.subscribe((status) => first.push(status));
    observable.subscribe((status) => second.push(status));

    observable.next("/search");
    await vi.waitFor(() => {
      expect(observable.getSnapshot()).toEqual({ type: "ready", path: "/search" });
    });

    expect(first).toEqual(second);
  });

  test("unsubscribe stops further notifications", async () => {
    const searchModule = createMockModule();
    const cartModule = createMockModule();
    const importer = vi.fn(async (specifier: string) => ({
      default: specifier === "@acme/search/index.mjs" ? searchModule : cartModule,
    }));
    const target = document.createElement("div");
    const statuses: RuntimeHostStatus[] = [];

    const observable = createRuntimeHostObservable({ manifest, target, importer });
    const unsubscribe = observable.subscribe((status) => statuses.push(status));

    observable.next("/search");
    await vi.waitFor(() => {
      expect(observable.getSnapshot()).toEqual({ type: "ready", path: "/search" });
    });

    unsubscribe();
    statuses.length = 0;

    observable.next("/cart");
    await vi.waitFor(() => {
      expect(observable.getSnapshot()).toEqual({ type: "ready", path: "/cart" });
    });

    expect(statuses).toEqual([]);
  });

  test("getSnapshot returns the same object reference until the next transition", async () => {
    const searchModule = createMockModule();
    const importer = vi.fn(async () => ({ default: searchModule }));
    const target = document.createElement("div");

    const observable = createRuntimeHostObservable({ manifest, target, importer });
    observable.next("/search");

    await vi.waitFor(() => {
      expect(observable.getSnapshot()).toEqual({ type: "ready", path: "/search" });
    });

    const first = observable.getSnapshot();
    const second = observable.getSnapshot();
    expect(first).toBe(second);
  });

  test("navigating to the same specifier again does not change status", async () => {
    const searchModule = createMockModule();
    const importer = vi.fn(async () => ({ default: searchModule }));
    const target = document.createElement("div");
    const statuses: RuntimeHostStatus[] = [];

    const observable = createRuntimeHostObservable({ manifest, target, importer });
    observable.next("/search");
    await vi.waitFor(() => {
      expect(observable.getSnapshot()).toEqual({ type: "ready", path: "/search" });
    });

    observable.subscribe((status) => statuses.push(status));
    observable.next("/search/results");

    expect(statuses).toEqual([]);
  });

  test("destroy() unmounts the current module", async () => {
    const searchModule = createMockModule();
    const importer = vi.fn(async () => ({ default: searchModule }));
    const target = document.createElement("div");

    const observable = createRuntimeHostObservable({ manifest, target, importer });
    observable.next("/search");
    await vi.waitFor(() => {
      expect(observable.getSnapshot()).toEqual({ type: "ready", path: "/search" });
    });

    await observable.destroy();
    expect(searchModule.unmount).toHaveBeenCalledTimes(1);
  });
});
