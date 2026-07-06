import type * as ReactNamespace from "react";
import {
  createRuntimeHostObservable,
  type RuntimeHostObservable,
  type RuntimeHostObservableOptions,
  type RuntimeHostStatus,
} from "@rmc-toolkit/core";

export type UseRuntimeHostOptions = Omit<RuntimeHostObservableOptions, "target">;

export type UseRuntimeHostResult<T extends Element> = {
  ref: ReactNamespace.RefObject<T | null>;
  status: RuntimeHostStatus;
};

// Shared reference, not an inline `{ type: "idle" }` literal: useSyncExternalStore
// compares getSnapshot()'s return value by reference and treats any change as "the
// store changed". A fresh object on every call (before the observable exists) would
// look like a change on every render and cause an infinite re-render loop.
const idleStatus: RuntimeHostStatus = { type: "idle" };

export const createReactAdapter = (
  React: typeof ReactNamespace,
): {
  useRuntimeHost<T extends Element>(
    path: string,
    options: UseRuntimeHostOptions,
  ): UseRuntimeHostResult<T>;
} => {
  const useRuntimeHost = <T extends Element>(
    path: string,
    options: UseRuntimeHostOptions,
  ): UseRuntimeHostResult<T> => {
    const ref = React.useRef<T>(null);
    const observableRef = React.useRef<RuntimeHostObservable | null>(null);

    React.useEffect(() => {
      if (!ref.current) {
        return;
      }
      const observable = createRuntimeHostObservable({ ...options, target: ref.current });
      observableRef.current = observable;
      return () => {
        void observable.destroy();
        observableRef.current = null;
      };
    }, []);

    // Relies on React running a component's effects in declaration order on mount:
    // the creation effect above must run first and populate observableRef.current
    // before this effect's initial run, so the first next(path) call isn't dropped.
    // Do not reorder these effects or merge them into one.
    React.useEffect(() => {
      observableRef.current?.next(path);
    }, [path]);

    // Re-reads observableRef.current lazily on each call rather than capturing the
    // observable once: capturing it here would keep referencing a destroyed
    // observable across a remount or a Strict-Mode mount/unmount/mount cycle, since
    // this callback (memoized with an empty dep array) is not recreated when the
    // creation effect re-runs and assigns a new observable to the ref.
    const subscribe = React.useCallback((onStoreChange: () => void): (() => void) => {
      if (!observableRef.current) {
        return () => {};
      }
      return observableRef.current.subscribe(() => onStoreChange());
    }, []);

    const getSnapshot = React.useCallback(
      (): RuntimeHostStatus => observableRef.current?.getSnapshot() ?? idleStatus,
      [],
    );

    const status = React.useSyncExternalStore(subscribe, getSnapshot);

    return { ref, status };
  };

  return { useRuntimeHost };
};
