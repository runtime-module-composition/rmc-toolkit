// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";
import { notifyInternalNavigation } from "./host.js";

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
