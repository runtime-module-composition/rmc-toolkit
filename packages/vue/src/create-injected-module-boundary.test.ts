// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";
import * as Vue from "vue";
import { createApp, h } from "vue";

const mockFactory = vi.fn((_deps: { Vue: typeof Vue }) => ({
  render() {
    return h("span", null, "injected content");
  },
}));
// Return type annotated explicitly (default: unknown, not mockFactory's exact
// Mock<...> type) so that mockResolvedValueOnce below can supply a
// differently-shaped `default` (e.g. one that throws) without a type error --
// mirrors the same fix in create-injected-module-boundary.test.tsx in
// packages/react.
const mockImportModule = vi.fn(
  async (): Promise<{
    default: (deps: { Vue: typeof Vue }) => unknown;
  }> => ({
    default: mockFactory,
  }),
);

vi.mock("@rmc-toolkit/core", () => ({
  importModule: mockImportModule,
}));

const { createInjectedModuleBoundary } = await import("./create-injected-module-boundary.js");

// Vue's defineAsyncComponent doesn't settle its inner ref-driven re-render in
// a single microtask turn: the loader's own promise chain (importer -> await
// -> factory) and Vue's internal `loaded` ref update each add their own
// .then() hop, and the re-render those schedule goes through Vue's job
// queue, which is itself a further microtask hop past nextTick()'s own
// promise. Two nextTick() calls (enough for a plain reactive update) are not
// enough to observe the resolved/errored DOM here; looping nextTick() a
// generous number of times reliably flushes all of it without hardcoding a
// fragile exact hop count.
const flushAsync = async (times = 10): Promise<void> => {
  for (let i = 0; i < times; i++) {
    await Vue.nextTick();
  }
};

describe("createInjectedModuleBoundary (Vue)", () => {
  test("calls the slice's factory with the injected Vue instance", async () => {
    mockFactory.mockClear();
    mockImportModule.mockClear();

    const { InjectedModuleBoundary } = createInjectedModuleBoundary(Vue);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const app = createApp(InjectedModuleBoundary, { specifier: "test-specifier" });
    app.mount(container);

    await flushAsync();

    expect(mockImportModule).toHaveBeenCalledWith("test-specifier");
    expect(mockFactory).toHaveBeenCalledWith({ Vue });
    expect(container.textContent).toBe("injected content");

    app.unmount();
  });

  test("merges extraDeps into the deps bag passed to the factory", async () => {
    mockFactory.mockClear();

    const theme = { color: "blue" };
    const { InjectedModuleBoundary } = createInjectedModuleBoundary(Vue, { theme });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const app = createApp(InjectedModuleBoundary, { specifier: "test-specifier" });
    app.mount(container);

    await Vue.nextTick();
    await Vue.nextTick();

    expect(mockFactory).toHaveBeenCalledWith({ Vue, theme });

    app.unmount();
  });

  test("does not re-invoke the factory on an unrelated parent re-render", async () => {
    mockImportModule.mockClear();
    mockImportModule.mockResolvedValue({ default: mockFactory });
    mockFactory.mockClear();

    const { InjectedModuleBoundary } = createInjectedModuleBoundary(Vue);
    const tick = Vue.ref(0);
    const Parent = {
      setup() {
        return () =>
          Vue.h("div", [
            tick.value,
            Vue.h(InjectedModuleBoundary, { specifier: "stable-specifier" }),
          ]);
      },
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const app = createApp(Parent);
    app.mount(container);
    await Vue.nextTick();
    await Vue.nextTick();

    tick.value = 1;
    await Vue.nextTick();
    await Vue.nextTick();

    expect(mockImportModule).toHaveBeenCalledTimes(1);

    app.unmount();
  });

  test("supports an async factory", async () => {
    mockImportModule.mockResolvedValueOnce({
      default: async (_deps: { Vue: typeof Vue }) => {
        await Promise.resolve();
        return {
          render() {
            return h("span", null, "async content");
          },
        };
      },
    });

    const { InjectedModuleBoundary } = createInjectedModuleBoundary(Vue);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const app = createApp(InjectedModuleBoundary, { specifier: "async-specifier" });
    app.mount(container);

    await flushAsync();

    expect(container.textContent).toBe("async content");

    app.unmount();
  });

  test("does not re-invoke the factory when only fallback changes", async () => {
    mockImportModule.mockClear();
    mockImportModule.mockResolvedValue({ default: mockFactory });
    mockFactory.mockClear();

    const { InjectedModuleBoundary } = createInjectedModuleBoundary(Vue);
    const fallback = Vue.shallowRef<Vue.Component | undefined>(undefined);
    const Parent = {
      setup() {
        return () =>
          Vue.h(InjectedModuleBoundary, {
            specifier: "stable-specifier",
            ...(fallback.value === undefined ? {} : { fallback: fallback.value }),
          });
      },
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const app = createApp(Parent);
    app.mount(container);
    await flushAsync();

    expect(mockImportModule).toHaveBeenCalledTimes(1);

    fallback.value = { render: () => h("span", null, "loading") };
    await flushAsync();

    expect(mockImportModule).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe("injected content");

    app.unmount();
  });

  test("switching specifier re-invokes the factory rather than reusing a stale component", async () => {
    mockImportModule.mockClear();
    mockImportModule.mockResolvedValue({ default: mockFactory });
    mockFactory.mockClear();

    const { InjectedModuleBoundary } = createInjectedModuleBoundary(Vue);
    const specifier = Vue.ref("first-specifier");
    const Parent = {
      setup() {
        return () => Vue.h(InjectedModuleBoundary, { specifier: specifier.value });
      },
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const app = createApp(Parent);
    app.mount(container);
    await flushAsync();

    specifier.value = "second-specifier";
    await flushAsync();

    expect(mockImportModule).toHaveBeenCalledTimes(2);
    expect(mockImportModule).toHaveBeenNthCalledWith(1, "first-specifier");
    expect(mockImportModule).toHaveBeenNthCalledWith(2, "second-specifier");

    app.unmount();
  });

  test("ignores a stale rejection from an abandoned specifier's load", async () => {
    mockImportModule.mockClear();
    mockFactory.mockClear();

    let rejectFirst: (err: unknown) => void;
    const firstPromise = new Promise((_resolve, reject) => {
      rejectFirst = reject;
    });

    mockImportModule.mockImplementationOnce(() => firstPromise as never);
    mockImportModule.mockResolvedValueOnce({ default: mockFactory });

    const ErrorFallback = { render: () => h("span", null, "failed") };
    const { InjectedModuleBoundary } = createInjectedModuleBoundary(Vue);
    const specifier = Vue.ref("first-specifier");
    const Parent = {
      setup() {
        return () =>
          Vue.h(InjectedModuleBoundary, {
            specifier: specifier.value,
            errorFallback: ErrorFallback,
          });
      },
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const app = createApp(Parent);
    app.mount(container);
    await flushAsync();

    specifier.value = "second-specifier";
    await flushAsync();

    expect(container.textContent).toBe("injected content");

    rejectFirst!(new Error("stale rejection"));
    await flushAsync();

    expect(container.textContent).toBe("injected content");
    expect(mockImportModule).toHaveBeenCalledTimes(2);
    expect(mockImportModule).toHaveBeenNthCalledWith(1, "first-specifier");
    expect(mockImportModule).toHaveBeenNthCalledWith(2, "second-specifier");

    app.unmount();
  });

  test("ignores a stale rejection from an abandoned load even when the specifier switches back to its original value", async () => {
    mockImportModule.mockClear();
    mockFactory.mockClear();

    let rejectFirstA: (err: unknown) => void;
    const firstAPromise = new Promise((_resolve, reject) => {
      rejectFirstA = reject;
    });

    mockImportModule.mockImplementationOnce(() => firstAPromise as never);
    mockImportModule.mockResolvedValueOnce({ default: mockFactory });
    mockImportModule.mockResolvedValueOnce({ default: mockFactory });

    const ErrorFallback = { render: () => h("span", null, "failed") };
    const { InjectedModuleBoundary } = createInjectedModuleBoundary(Vue);
    const specifier = Vue.ref("A");
    const Parent = {
      setup() {
        return () =>
          Vue.h(InjectedModuleBoundary, {
            specifier: specifier.value,
            errorFallback: ErrorFallback,
          });
      },
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const app = createApp(Parent);
    app.mount(container);
    await flushAsync();

    specifier.value = "B";
    await flushAsync();

    specifier.value = "A";
    await flushAsync();

    expect(container.textContent).toBe("injected content");

    rejectFirstA!(new Error("stale rejection from the first A load"));
    await flushAsync();

    expect(container.textContent).toBe("injected content");
    expect(mockImportModule).toHaveBeenCalledTimes(3);
    expect(mockImportModule).toHaveBeenNthCalledWith(1, "A");
    expect(mockImportModule).toHaveBeenNthCalledWith(2, "B");
    expect(mockImportModule).toHaveBeenNthCalledWith(3, "A");

    app.unmount();
  });

  test("catches a factory that throws and renders errorFallback", async () => {
    mockImportModule.mockResolvedValueOnce({
      default: () => {
        throw new Error("boom");
      },
    });

    const ErrorFallback = { render: () => h("span", null, "failed") };
    const { InjectedModuleBoundary } = createInjectedModuleBoundary(Vue);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const app = createApp(InjectedModuleBoundary, {
      specifier: "broken-specifier",
      errorFallback: ErrorFallback,
    });
    app.mount(container);

    await flushAsync();

    expect(container.textContent).toBe("failed");

    app.unmount();
  });
});
