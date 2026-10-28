import type * as VueNamespace from "vue";
import {
  importModule,
  type DynamicImporter,
  type RuntimeModuleContext,
} from "@rmc-toolkit/core";

type DirectRuntimeModule = {
  default: VueNamespace.Component<{ context?: RuntimeModuleContext }>;
};

export type DynamicModuleBoundaryProps = {
  specifier: string;
  context?: RuntimeModuleContext;
  fallback?: VueNamespace.Component;
  errorFallback?: VueNamespace.Component;
  importer?: DynamicImporter;
};

const defaultImporter: DynamicImporter = importModule;

// Structurally this mirrors createInjectedModuleBoundary almost exactly --
// same defineAsyncComponent + Suspense + onErrorCaptured shape, same
// load-generation staleness guard (see that file for the full reasoning on
// each piece). The one real difference is what the loader does with the
// resolved module: Direct's slice default-exports the component itself, so
// the loader resolves straight to `loadedModule.default` instead of calling
// a factory with an injected deps bag -- which is also why this factory
// takes no `extraDeps` parameter, unlike createInjectedModuleBoundary.
export const createDynamicModuleBoundary = (
  Vue: typeof VueNamespace,
): {
  DynamicModuleBoundary: VueNamespace.Component<DynamicModuleBoundaryProps>;
} => {
  const DynamicModuleBoundary = Vue.defineComponent({
    name: "DynamicModuleBoundary",
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
      // See createInjectedModuleBoundary: recomputed only on specifier/importer
      // changes, and currentLoadGeneration tracks the live load the same way,
      // for the same reasons.
      let currentLoadGeneration = 0;

      const asyncComponent = Vue.computed(() => {
        const importer = props.importer ?? defaultImporter;
        const specifier = props.specifier;
        const loadGeneration = ++currentLoadGeneration;

        return Vue.defineAsyncComponent(async () => {
          try {
            const loadedModule = (await importer(specifier)) as DirectRuntimeModule;
            return loadedModule.default;
          } catch (caughtError) {
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

  return { DynamicModuleBoundary };
};
