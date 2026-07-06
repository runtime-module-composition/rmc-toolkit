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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    React.useEffect(() => {
      observableRef.current?.next(path);
    }, [path]);

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
