// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

const mockFactory = vi.fn((deps: { React: typeof React }) => {
  const Component = () => deps.React.createElement("span", null, "injected content");
  return Component;
});
const mockImportModule = vi.fn(
  async (): Promise<{
    default: (deps: { React: typeof React }) => unknown;
  }> => ({
    default: mockFactory,
  }),
);

vi.mock("@rmc-toolkit/core", () => ({
  importModule: mockImportModule,
}));

const { createInjectedModuleBoundary } = await import("./create-injected-module-boundary.js");

describe("InjectedModuleBoundary", () => {
  test("calls the slice's factory with the injected React instance", async () => {
    mockFactory.mockClear();
    mockImportModule.mockClear();

    const { InjectedModuleBoundary } = createInjectedModuleBoundary(React);
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<InjectedModuleBoundary specifier="test-specifier" />);
    });

    expect(mockImportModule).toHaveBeenCalledWith("test-specifier");
    expect(mockFactory).toHaveBeenCalledWith({ React });
    expect(container.textContent).toBe("injected content");

    root.unmount();
  });

  test("merges extraDeps into the deps bag passed to the factory", async () => {
    mockFactory.mockClear();

    const theme = { color: "blue" };
    const { InjectedModuleBoundary } = createInjectedModuleBoundary(React, { theme });
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<InjectedModuleBoundary specifier="test-specifier" />);
    });

    expect(mockFactory).toHaveBeenCalledWith({ React, theme });

    root.unmount();
  });

  test("supports an async factory", async () => {
    mockImportModule.mockResolvedValueOnce({
      default: async (deps: { React: typeof React }) => {
        await Promise.resolve();
        return () => deps.React.createElement("span", null, "async content");
      },
    });

    const { InjectedModuleBoundary } = createInjectedModuleBoundary(React);
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<InjectedModuleBoundary specifier="async-specifier" />);
    });

    expect(container.textContent).toBe("async content");

    root.unmount();
  });

  test("catches a factory that throws and renders errorFallback", async () => {
    mockImportModule.mockResolvedValueOnce({
      default: () => {
        throw new Error("boom");
      },
    });

    const { InjectedModuleBoundary } = createInjectedModuleBoundary(React);
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <InjectedModuleBoundary specifier="broken-specifier" errorFallback={<span>failed</span>} />,
      );
    });

    expect(container.textContent).toBe("failed");

    root.unmount();
  });

  test("does not re-invoke the factory on an unrelated parent re-render", async () => {
    mockImportModule.mockClear();
    mockImportModule.mockResolvedValue({ default: mockFactory });
    mockFactory.mockClear();

    const { InjectedModuleBoundary } = createInjectedModuleBoundary(React);
    const container = document.createElement("div");
    const root = createRoot(container);

    const Parent = ({ tick }: { tick: number }) => (
      <div>
        {tick}
        <InjectedModuleBoundary specifier="stable-specifier" />
      </div>
    );

    await act(async () => {
      root.render(<Parent tick={0} />);
    });
    await act(async () => {
      root.render(<Parent tick={1} />);
    });

    expect(mockImportModule).toHaveBeenCalledTimes(1);

    root.unmount();
  });

  test("switching specifier re-invokes the factory rather than reusing a stale component", async () => {
    mockImportModule.mockClear();
    mockImportModule.mockResolvedValue({ default: mockFactory });
    mockFactory.mockClear();

    const { InjectedModuleBoundary } = createInjectedModuleBoundary(React);
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<InjectedModuleBoundary specifier="first-specifier" />);
    });
    await act(async () => {
      root.render(<InjectedModuleBoundary specifier="second-specifier" />);
    });

    expect(mockImportModule).toHaveBeenCalledTimes(2);
    expect(mockImportModule).toHaveBeenNthCalledWith(1, "first-specifier");
    expect(mockImportModule).toHaveBeenNthCalledWith(2, "second-specifier");

    root.unmount();
  });
});
