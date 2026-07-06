import { createRuntimeHost } from "./host.js";
import type { RuntimeHostOptions } from "./host.js";

export type RuntimeHostStatus =
  | { type: "idle" }
  | { type: "loading"; path: string }
  | { type: "ready"; path: string }
  | { type: "error"; path: string; error: unknown };

export type RuntimeHostObservableOptions = Pick<
  RuntimeHostOptions,
  "manifest" | "target" | "importer"
>;

export type RuntimeHostObservable = {
  next(path: string): void;
  subscribe(observer: (status: RuntimeHostStatus) => void): () => void;
  getSnapshot(): RuntimeHostStatus;
  destroy(): Promise<void>;
};

export const createRuntimeHostObservable = (
  options: RuntimeHostObservableOptions,
): RuntimeHostObservable => {
  let currentStatus: RuntimeHostStatus = { type: "idle" };
  const observers = new Set<(status: RuntimeHostStatus) => void>();

  const setStatus = (status: RuntimeHostStatus): void => {
    currentStatus = status;
    for (const observer of observers) {
      observer(status);
    }
  };

  const host = createRuntimeHost({
    ...options,
    onLoading: (path) => setStatus({ type: "loading", path }),
    onReady: (path) => setStatus({ type: "ready", path }),
    onError: (error, path) => setStatus({ type: "error", path, error }),
  });

  return {
    next(path: string): void {
      void host.resolveAndMount(path);
    },
    subscribe(observer: (status: RuntimeHostStatus) => void): () => void {
      observers.add(observer);
      return () => {
        observers.delete(observer);
      };
    },
    getSnapshot(): RuntimeHostStatus {
      return currentStatus;
    },
    destroy(): Promise<void> {
      return host.destroy();
    },
  };
};
