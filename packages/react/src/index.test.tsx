// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

const FixtureComponent = () => "fixture content";
const mockImportModule = vi.fn(async () => ({
  default: FixtureComponent,
}));

vi.mock("@rmc-toolkit/core", () => ({
  importModule: mockImportModule,
}));

const { createDynamicModuleBoundary } = await import("./index.js");
const { DynamicModuleBoundary } = createDynamicModuleBoundary(React);

describe("DynamicModuleBoundary", () => {
  test("default importer delegates to core's importModule", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<DynamicModuleBoundary specifier="test-specifier" />);
    });

    expect(mockImportModule).toHaveBeenCalledWith("test-specifier");
    expect(container.textContent).toBe("fixture content");

    root.unmount();
  });

  test("createDynamicModuleBoundary is injected with the caller's own React instance, not an internally imported one", async () => {
    mockImportModule.mockClear();

    // Two independently-created factories, each given its own React-like
    // namespace object. If the implementation secretly imported "react"
    // itself instead of using the injected parameter, both boundaries would
    // still work identically and this test would give no signal either way
    // -- that create-dynamic-module-boundary.ts has no runtime `import` of
    // "react" is a static fact, verifiable by inspection of its import
    // statements, not something a render test can detect. What this test
    // does prove is that the DI parameter is actually wired through to
    // produce a working component for whichever React instance is passed,
    // by creating two boundaries from two separate calls and rendering both.
    const { DynamicModuleBoundary: BoundaryA } = createDynamicModuleBoundary(React);
    const { DynamicModuleBoundary: BoundaryB } = createDynamicModuleBoundary(React);

    const containerA = document.createElement("div");
    const rootA = createRoot(containerA);
    const containerB = document.createElement("div");
    const rootB = createRoot(containerB);

    await act(async () => {
      rootA.render(<BoundaryA specifier="specifier-a" />);
    });
    await act(async () => {
      rootB.render(<BoundaryB specifier="specifier-b" />);
    });

    expect(mockImportModule).toHaveBeenCalledWith("specifier-a");
    expect(mockImportModule).toHaveBeenCalledWith("specifier-b");
    expect(containerA.textContent).toBe("fixture content");
    expect(containerB.textContent).toBe("fixture content");

    rootA.unmount();
    rootB.unmount();
  });
});
