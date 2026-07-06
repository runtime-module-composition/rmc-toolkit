// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

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

const { createReactAdapter } = await import("./create-react-adapter.js");

const manifest = { namespace: "@acme", assetsOrigin: "https://assets.example.com" };

describe("createReactAdapter", () => {
  test("creates one observable per mounted component, forwards path to next(), and surfaces status", async () => {
    const { useRuntimeHost } = createReactAdapter(React);
    let renderedStatus: Status | undefined;

    const TestComponent = ({ path }: { path: string }): React.ReactElement => {
      const { ref, status } = useRuntimeHost<HTMLDivElement>(path, { manifest });
      renderedStatus = status;
      return React.createElement("div", { ref });
    };

    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(TestComponent, { path: "/search" }));
    });

    expect(mockCreateRuntimeHostObservable).toHaveBeenCalledTimes(1);
    expect(mockNext).toHaveBeenCalledWith("/search");
    expect(renderedStatus).toEqual({ type: "ready", path: "/search" });

    await act(async () => {
      root.unmount();
    });
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  test("forwards a new path to next() when the path prop changes, without recreating the observable", async () => {
    mockCreateRuntimeHostObservable.mockClear();
    mockNext.mockClear();
    const { useRuntimeHost } = createReactAdapter(React);

    const TestComponent = ({ path }: { path: string }): React.ReactElement => {
      const { ref } = useRuntimeHost<HTMLDivElement>(path, { manifest });
      return React.createElement("div", { ref });
    };

    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(TestComponent, { path: "/search" }));
    });
    await act(async () => {
      root.render(React.createElement(TestComponent, { path: "/cart" }));
    });

    expect(mockCreateRuntimeHostObservable).toHaveBeenCalledTimes(1);
    expect(mockNext).toHaveBeenNthCalledWith(1, "/search");
    expect(mockNext).toHaveBeenNthCalledWith(2, "/cart");

    await act(async () => {
      root.unmount();
    });
  });
});
