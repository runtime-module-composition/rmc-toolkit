import type * as ReactNamespace from "react";
import {
  importModule,
  type DynamicImporter,
  type RuntimeModuleContext,
} from "@rmc-toolkit/core";

type InjectedRuntimeModule<TDeps> = {
  default: (
    deps: TDeps,
  ) =>
    | ReactNamespace.ComponentType<{ context?: RuntimeModuleContext }>
    | Promise<ReactNamespace.ComponentType<{ context?: RuntimeModuleContext }>>;
};

export type InjectedModuleBoundaryProps = {
  specifier: string;
  context?: RuntimeModuleContext;
  fallback?: ReactNamespace.ReactNode;
  errorFallback?: ReactNamespace.ReactNode;
  importer?: DynamicImporter;
};

const defaultImporter: DynamicImporter = importModule;

// Intentionally `.ts`, not `.tsx` -- see create-dynamic-module-boundary.ts's
// own comment for why: JSX here would auto-inject an
// `import ... from "react/jsx-runtime"` that bypasses the injected React
// parameter entirely. Every element below is built with
// React.createElement(...) using the namespace passed in as a parameter.
export const createInjectedModuleBoundary = <TExtraDeps extends object = Record<string, never>>(
  React: typeof ReactNamespace,
  extraDeps?: TExtraDeps,
): {
  InjectedModuleBoundary: (props: InjectedModuleBoundaryProps) => ReactNamespace.ReactElement;
} => {
  // Computed once, at createInjectedModuleBoundary()'s own call time -- not
  // per-render, and not a component prop. A per-render deps object would need
  // to sit in useMemo's dependency array below, and a fresh object literal
  // supplied on every render would silently defeat that memoization and
  // remount the slice on every parent re-render, the same footgun
  // specifier/importer already have to guard against. If a host needs a
  // different set of extra deps for a different group of slices, it calls
  // createInjectedModuleBoundary() again for those slices instead.
  const deps = { React, ...extraDeps } as { React: typeof ReactNamespace } & TExtraDeps;

  type ErrorBoundaryState = { error: unknown };

  class ErrorBoundary extends React.Component<
    { children: ReactNamespace.ReactNode; fallback: ReactNamespace.ReactNode },
    ErrorBoundaryState
  > {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
      return { error };
    }

    render(): ReactNamespace.ReactNode {
      if (this.state.error) {
        return this.props.fallback;
      }

      return this.props.children;
    }
  }

  const InjectedModuleBoundary = ({
    specifier,
    context,
    fallback = null,
    errorFallback = null,
    importer = defaultImporter,
  }: InjectedModuleBoundaryProps): ReactNamespace.ReactElement => {
    const LazyModule = React.useMemo(
      () =>
        React.lazy(async () => {
          const loadedModule = (await importer(specifier)) as InjectedRuntimeModule<typeof deps>;
          const component = await loadedModule.default(deps);
          return { default: component };
        }),
      [specifier, importer],
    );
    const moduleProps =
      context === undefined
        ? {}
        : ({ context } satisfies { context: RuntimeModuleContext });

    return React.createElement(
      React.Suspense,
      { fallback },
      React.createElement(ErrorBoundary, {
        key: specifier,
        fallback: errorFallback,
        children: React.createElement(LazyModule, moduleProps),
      }),
    );
  };

  return { InjectedModuleBoundary };
};
