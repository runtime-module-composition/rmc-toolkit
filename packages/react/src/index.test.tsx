// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

const FixtureComponent = () => "fixture content";
const mockImportModule = vi.fn(async () => ({
  default: FixtureComponent,
}));

vi.mock("@runtime-module-composition/core", () => ({
  importModule: mockImportModule,
}));

const { DynamicModuleBoundary } = await import("./index.js");

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
});
