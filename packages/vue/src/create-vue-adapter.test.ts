// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";
import * as Vue from "vue";
import { createApp, h } from "vue";

type Status = { type: string; path?: string };

const observers = new Set<(status: Status) => void>();
let currentStatus: Status = { type: "idle" };
const mockNext = vi.fn((path: string) => {
  currentStatus = { type: "loading", path };
  observers.forEach((observer) => observer(currentStatus));
  currentStatus = { type: "ready", path };
  observers.forEach((observer) => observer(currentStatus));
});
const mockDestroy = vi.fn(async () => {});
const mockCreateRuntimeHostObservable = vi.fn((_options: unknown) => ({
  next: mockNext,
  destroy: mockDestroy,
  subscribe: (observer: (status: Status) => void) => {
    observers.add(observer);
    return () => observers.delete(observer);
  },
  getSnapshot: () => currentStatus,
}));

vi.mock("@rmc-toolkit/core", () => ({
  createRuntimeHostObservable: (options: unknown) => mockCreateRuntimeHostObservable(options),
}));

const { createVueAdapter } = await import("./create-vue-adapter.js");

const manifest = { namespace: "@acme", assetsOrigin: "https://assets.example.com" };

describe("createVueAdapter", () => {
  test("creates one observable on mount, forwards the initial path to next(), and surfaces status", async () => {
    mockCreateRuntimeHostObservable.mockClear();
    mockNext.mockClear();
    mockDestroy.mockClear();
    currentStatus = { type: "idle" };

    const { useRuntimeHost } = createVueAdapter(Vue);
    const currentPath = Vue.ref("/search");

    const TestComponent = {
      setup() {
        return useRuntimeHost(() => currentPath.value, { manifest });
      },
      render(this: { target: unknown; status: Status }) {
        return h("div", { ref: "target" }, this.status.type);
      },
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const app = createApp(TestComponent);
    app.mount(container);

    await Vue.nextTick();

    expect(mockCreateRuntimeHostObservable).toHaveBeenCalledTimes(1);
    expect(mockNext).toHaveBeenCalledWith("/search");
    expect(container.textContent).toBe("ready");

    app.unmount();
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  test("forwards a new path to next() when the reactive path source changes", async () => {
    mockCreateRuntimeHostObservable.mockClear();
    mockNext.mockClear();
    currentStatus = { type: "idle" };

    const { useRuntimeHost } = createVueAdapter(Vue);
    const currentPath = Vue.ref("/search");

    const TestComponent = {
      setup() {
        return useRuntimeHost(() => currentPath.value, { manifest });
      },
      render(this: { target: unknown }) {
        return h("div", { ref: "target" });
      },
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const app = createApp(TestComponent);
    app.mount(container);
    await Vue.nextTick();

    currentPath.value = "/cart";
    await Vue.nextTick();

    expect(mockCreateRuntimeHostObservable).toHaveBeenCalledTimes(1);
    expect(mockNext).toHaveBeenNthCalledWith(1, "/search");
    expect(mockNext).toHaveBeenNthCalledWith(2, "/cart");

    app.unmount();
  });
});
