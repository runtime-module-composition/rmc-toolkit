import type * as VueNamespace from "vue";
import {
  createRuntimeHostObservable,
  type RuntimeHostObservable,
  type RuntimeHostObservableOptions,
  type RuntimeHostStatus,
} from "@rmc-toolkit/core";

export type UseRuntimeHostOptions = Omit<RuntimeHostObservableOptions, "target">;

export type UseRuntimeHostResult = {
  target: VueNamespace.Ref<Element | null>;
  status: VueNamespace.Ref<RuntimeHostStatus>;
};

export const createVueAdapter = (
  Vue: typeof VueNamespace,
): {
  useRuntimeHost(path: () => string, options: UseRuntimeHostOptions): UseRuntimeHostResult;
} => {
  const useRuntimeHost = (
    path: () => string,
    options: UseRuntimeHostOptions,
  ): UseRuntimeHostResult => {
    const target = Vue.ref<Element | null>(null);
    const status = Vue.ref<RuntimeHostStatus>({ type: "idle" });
    let observable: RuntimeHostObservable | null = null;
    let unsubscribe: (() => void) | null = null;

    Vue.onMounted(() => {
      if (!target.value) {
        return;
      }
      observable = createRuntimeHostObservable({ ...options, target: target.value });
      unsubscribe = observable.subscribe((next) => {
        status.value = next;
      });
      // Forward the initial path now that the observable exists. Reading the
      // observable's own getSnapshot() first would also work, but calling
      // next() unconditionally here mirrors the watcher below and guarantees
      // the first navigation happens exactly once, right after creation.
      observable.next(path());
    });

    // Deliberately a separate watcher rather than folded into onMounted: Vue
    // runs onMounted before any watcher registered in the same setup() has a
    // chance to fire for a later change, so by the time this watcher's
    // callback runs, observable is guaranteed to be non-null (mount already
    // happened). Do not merge this into onMounted or reorder it above the
    // onMounted call.
    Vue.watch(path, (newPath) => {
      observable?.next(newPath);
    });

    Vue.onUnmounted(() => {
      unsubscribe?.();
      unsubscribe = null;
      // Fire-and-forget: destroy() returns a Promise, but onUnmounted has no
      // way to keep the component alive until it settles, and callers of
      // useRuntimeHost have no handle to await it either. This matches
      // createReactAdapter's cleanup effect, which discards the same Promise.
      void observable?.destroy();
      observable = null;
    });

    return { target, status };
  };

  return { useRuntimeHost };
};
