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
      // Assigning .value here from an externally-triggered callback (not
      // during a component render or a computed/effect run) is safe by
      // design: a ref's setter just updates its value and notifies its
      // subscribers, and doesn't require an active reactive tracking
      // context. No nextTick() or other synchronization is needed, the same
      // way it wouldn't be for a WebSocket message handler updating a ref.
      unsubscribe = observable.subscribe((next) => {
        status.value = next;
      });
      // Forward the initial path now that the observable exists. Reading the
      // observable's own getSnapshot() first would also work, but calling
      // next() unconditionally here mirrors the watcher below and guarantees
      // the first navigation happens exactly once, right after creation.
      observable.next(path());
    });

    // Deliberately a separate watcher rather than folded into onMounted: the
    // watch callback registered here has no `{ immediate: true }`, so it
    // never fires synchronously during setup — it only fires on a later
    // reactive change, which cannot happen before mount completes and
    // onMounted's callback has already run and assigned `observable`. Do not
    // add `{ immediate: true }` to this watch call — that would let it fire
    // during setup, before observable is assigned, and (once mount does
    // complete) would also race a duplicate next(path()) against the one in
    // onMounted above.
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
