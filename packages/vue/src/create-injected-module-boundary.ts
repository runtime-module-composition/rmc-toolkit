import type * as VueNamespace from "vue";
import {
  importModule,
  type DynamicImporter,
  type RuntimeModuleContext,
} from "@rmc-toolkit/core";

type InjectedRuntimeModule<TDeps> = {
  default: (deps: TDeps) => VueNamespace.Component | Promise<VueNamespace.Component>;
};

export type InjectedModuleBoundaryProps = {
  specifier: string;
  context?: RuntimeModuleContext;
  fallback?: VueNamespace.Component;
  errorFallback?: VueNamespace.Component;
  importer?: DynamicImporter;
};

const defaultImporter: DynamicImporter = importModule;

export const createInjectedModuleBoundary = <TExtraDeps extends object = Record<string, never>>(
  Vue: typeof VueNamespace,
  extraDeps?: TExtraDeps,
): {
  InjectedModuleBoundary: VueNamespace.Component<InjectedModuleBoundaryProps>;
} => {
  // Computed once, at createInjectedModuleBoundary()'s own call time -- see
  // create-injected-module-boundary.ts in packages/react for the full
  // reasoning (same rule applies here: fixed at creation, never a prop).
  const deps = { Vue, ...extraDeps } as { Vue: typeof VueNamespace } & TExtraDeps;

  const InjectedModuleBoundary = Vue.defineComponent({
    name: "InjectedModuleBoundary",
    props: {
      specifier: { type: String, required: true },
      context: { type: Object as VueNamespace.PropType<RuntimeModuleContext>, required: false },
      fallback: { type: Object as VueNamespace.PropType<VueNamespace.Component>, required: false },
      errorFallback: {
        type: Object as VueNamespace.PropType<VueNamespace.Component>,
        required: false,
      },
      importer: {
        type: Function as VueNamespace.PropType<DynamicImporter>,
        required: false,
      },
    },
    setup(props) {
      // Recomputed only when props.specifier or props.importer change --
      // deliberately does NOT read props.fallback/props.errorFallback. Vue's
      // computed() tracks every reactive property read during its callback,
      // so baking loadingComponent/errorComponent into this same
      // defineAsyncComponent call (as Vue's API invites) would rebuild the
      // whole async component -- and re-invoke the slice's factory, re-fetch
      // the module -- any time just the fallback UI changed. Instead, the
      // loading/error UI is handled entirely outside this computed, via
      // Vue's own Suspense component and onErrorCaptured below, mirroring how
      // the React side keeps fallback/errorFallback out of its useMemo.
      //
      // currentLoadGeneration identifies which load is the "live" one. It's
      // a plain (non-reactive) counter, not the specifier string -- a
      // specifier can be switched away from and back to the same value
      // (A -> B -> A), which would produce two distinct loads that share a
      // specifier string but must still be told apart, since the first A's
      // load can still be in flight when the second A's load resolves.
      let currentLoadGeneration = 0;

      const asyncComponent = Vue.computed(() => {
        const importer = props.importer ?? defaultImporter;
        const specifier = props.specifier;
        const loadGeneration = ++currentLoadGeneration;

        return Vue.defineAsyncComponent(async () => {
          try {
            const loadedModule = (await importer(
              specifier,
            )) as InjectedRuntimeModule<typeof deps>;
            return await loadedModule.default(deps);
          } catch (caughtError) {
            // Vue's defineAsyncComponent (suspensible branch) has no
            // isUnmounted/staleness guard before calling onError, so a
            // rejection arriving after this load has been superseded by a
            // newer one would otherwise flip the boundary's
            // still-correctly-rendered current load over to errorFallback.
            // If this load is no longer the live one, swallow it by
            // resolving to a no-op component instead of rethrowing --
            // Suspense has already switched away from this branch, so it's
            // never actually rendered. Only rethrow (and let
            // onErrorCaptured handle it) when this load is still the live
            // one.
            if (loadGeneration !== currentLoadGeneration) {
              return () => null;
            }

            throw caughtError;
          }
        });
      });

      const error = Vue.ref<unknown>(null);

      Vue.onErrorCaptured((caughtError) => {
        error.value = caughtError;
        return false;
      });

      Vue.watch(
        () => props.specifier,
        () => {
          error.value = null;
        },
      );

      return () => {
        if (error.value) {
          return props.errorFallback === undefined ? null : Vue.h(props.errorFallback);
        }

        const moduleProps =
          props.context === undefined ? {} : { context: props.context };

        return Vue.h(
          Vue.Suspense,
          null,
          {
            default: () => Vue.h(asyncComponent.value, moduleProps),
            fallback: () => (props.fallback === undefined ? null : Vue.h(props.fallback)),
          },
        );
      };
    },
  });

  return { InjectedModuleBoundary };
};
