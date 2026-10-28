// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";
import * as Vue from "vue";
import { createApp, h } from "vue";

const FixtureComponent = {
  render() {
    return h("span", null, "fixture content");
  },
};

const mockImportModule = vi.fn(
  async (): Promise<{ default: unknown }> => ({
    default: FixtureComponent,
  }),
);

vi.mock("@rmc-toolkit/core", () => ({
  importModule: mockImportModule,
}));

const { createDynamicModuleBoundary } = await import("./create-dynamic-module-boundary.js");

// See create-injected-module-boundary.test.ts for why a generous nextTick()
// loop (rather than a fixed hop count) is needed to observe Vue's
// defineAsyncComponent settle.
const flushAsync = async (times = 10): Promise<void> => {
  for (let i = 0; i < times; i++) {
    await Vue.nextTick();
  }
};

describe("createDynamicModuleBoundary (Vue)", () => {
  test("renders the slice's default export directly, with no factory call", async () => {
    mockImportModule.mockClear();

    const { DynamicModuleBoundary } = createDynamicModuleBoundary(Vue);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const app = createApp(DynamicModuleBoundary, { specifier: "test-specifier" });
    app.mount(container);

    await flushAsync();

    expect(mockImportModule).toHaveBeenCalledWith("test-specifier");
    expect(container.textContent).toBe("fixture content");

    app.unmount();
  });

  test("createDynamicModuleBoundary is injected with the caller's own Vue instance, not an internally imported one", async () => {
    mockImportModule.mockClear();

    const { DynamicModuleBoundary: BoundaryA } = createDynamicModuleBoundary(Vue);
    const { DynamicModuleBoundary: BoundaryB } = createDynamicModuleBoundary(Vue);

    const containerA = document.createElement("div");
    document.body.appendChild(containerA);
    const appA = createApp(BoundaryA, { specifier: "specifier-a" });
    appA.mount(containerA);

    const containerB = document.createElement("div");
    document.body.appendChild(containerB);
    const appB = createApp(BoundaryB, { specifier: "specifier-b" });
    appB.mount(containerB);

    await flushAsync();

    expect(mockImportModule).toHaveBeenCalledWith("specifier-a");
    expect(mockImportModule).toHaveBeenCalledWith("specifier-b");
    expect(containerA.textContent).toBe("fixture content");
    expect(containerB.textContent).toBe("fixture content");

    appA.unmount();
    appB.unmount();
  });

  test("passes context through to the rendered component's props", async () => {
    mockImportModule.mockClear();
    const ContextProbe = {
      props: ["context"],
      render(this: { context?: unknown }) {
        return h("span", null, JSON.stringify(this.context));
      },
    };
    mockImportModule.mockResolvedValueOnce({ default: ContextProbe });

    const { DynamicModuleBoundary } = createDynamicModuleBoundary(Vue);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const app = createApp(DynamicModuleBoundary, {
      specifier: "test-specifier",
      context: { tenant: "acme" },
    });
    app.mount(container);

    await flushAsync();

    expect(container.textContent).toBe(JSON.stringify({ tenant: "acme" }));

    app.unmount();
  });

  test("renders fallback while the module is loading", async () => {
    mockImportModule.mockClear();
    let resolveLoad: (value: { default: unknown }) => void;
    mockImportModule.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }) as never,
    );

    const Fallback = { render: () => h("span", null, "loading") };
    const { DynamicModuleBoundary } = createDynamicModuleBoundary(Vue);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const app = createApp(DynamicModuleBoundary, {
      specifier: "test-specifier",
      fallback: Fallback,
    });
    app.mount(container);
    await Vue.nextTick();

    expect(container.textContent).toBe("loading");

    resolveLoad!({ default: FixtureComponent });
    await flushAsync();

    expect(container.textContent).toBe("fixture content");

    app.unmount();
  });

  test("does not re-invoke the importer on an unrelated parent re-render", async () => {
    mockImportModule.mockClear();
    mockImportModule.mockResolvedValue({ default: FixtureComponent });

    const { DynamicModuleBoundary } = createDynamicModuleBoundary(Vue);
    const tick = Vue.ref(0);
    const Parent = {
      setup() {
        return () =>
          Vue.h("div", [
            tick.value,
            Vue.h(DynamicModuleBoundary, { specifier: "stable-specifier" }),
          ]);
      },
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const app = createApp(Parent);
    app.mount(container);
    await flushAsync();

    tick.value = 1;
    await flushAsync();

    expect(mockImportModule).toHaveBeenCalledTimes(1);

    app.unmount();
  });

  test("does not re-invoke the importer when only fallback changes", async () => {
    mockImportModule.mockClear();
    mockImportModule.mockResolvedValue({ default: FixtureComponent });

    const { DynamicModuleBoundary } = createDynamicModuleBoundary(Vue);
    const fallback = Vue.shallowRef<Vue.Component | undefined>(undefined);
    const Parent = {
      setup() {
        return () =>
          Vue.h(DynamicModuleBoundary, {
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
    expect(container.textContent).toBe("fixture content");

    app.unmount();
  });

  test("switching specifier re-invokes the importer rather than reusing a stale component", async () => {
    mockImportModule.mockClear();
    mockImportModule.mockResolvedValue({ default: FixtureComponent });

    const { DynamicModuleBoundary } = createDynamicModuleBoundary(Vue);
    const specifier = Vue.ref("first-specifier");
    const Parent = {
      setup() {
        return () => Vue.h(DynamicModuleBoundary, { specifier: specifier.value });
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

    let rejectFirst: (err: unknown) => void;
    const firstPromise = new Promise((_resolve, reject) => {
      rejectFirst = reject;
    });

    mockImportModule.mockImplementationOnce(() => firstPromise as never);
    mockImportModule.mockResolvedValueOnce({ default: FixtureComponent });

    const ErrorFallback = { render: () => h("span", null, "failed") };
    const { DynamicModuleBoundary } = createDynamicModuleBoundary(Vue);
    const specifier = Vue.ref("first-specifier");
    const Parent = {
      setup() {
        return () =>
          Vue.h(DynamicModuleBoundary, {
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

    expect(container.textContent).toBe("fixture content");

    rejectFirst!(new Error("stale rejection"));
    await flushAsync();

    expect(container.textContent).toBe("fixture content");
    expect(mockImportModule).toHaveBeenCalledTimes(2);

    app.unmount();
  });

  test("catches a loader rejection and renders errorFallback", async () => {
    mockImportModule.mockClear();
    mockImportModule.mockRejectedValueOnce(new Error("boom"));

    const ErrorFallback = { render: () => h("span", null, "failed") };
    const { DynamicModuleBoundary } = createDynamicModuleBoundary(Vue);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const app = createApp(DynamicModuleBoundary, {
      specifier: "broken-specifier",
      errorFallback: ErrorFallback,
    });
    app.mount(container);

    await flushAsync();

    expect(container.textContent).toBe("failed");

    app.unmount();
  });
});
