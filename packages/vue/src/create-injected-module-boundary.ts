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
      const asyncComponent = Vue.computed(() => {
        const importer = props.importer ?? defaultImporter;
        const specifier = props.specifier;
        return Vue.defineAsyncComponent({
          loader: async () => {
            const loadedModule = (await importer(specifier)) as InjectedRuntimeModule<typeof deps>;
            return loadedModule.default(deps);
          },
          ...(props.fallback === undefined ? {} : { loadingComponent: props.fallback }),
          ...(props.errorFallback === undefined ? {} : { errorComponent: props.errorFallback }),
        });
      });

      return () =>
        Vue.h(asyncComponent.value, props.context === undefined ? {} : { context: props.context });
    },
  });

  return { InjectedModuleBoundary };
};
