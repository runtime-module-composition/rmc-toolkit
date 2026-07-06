import type * as ReactNamespace from "react";
import {
  importModule,
  type DynamicImporter,
  type RuntimeModuleContext,
} from "@rmc-toolkit/core";

type ReactRuntimeModule = {
  default: ReactNamespace.ComponentType<{ context?: RuntimeModuleContext }>;
};

export type DynamicModuleBoundaryProps = {
  specifier: string;
  context?: RuntimeModuleContext;
  fallback?: ReactNamespace.ReactNode;
  errorFallback?: ReactNamespace.ReactNode;
  importer?: DynamicImporter;
};

const defaultImporter: DynamicImporter = importModule;

// This file is intentionally `.ts`, not `.tsx`: with "jsx": "react-jsx" in
// tsconfig.json, any JSX syntax in a file makes the compiler auto-inject a
// runtime `import ... from "react/jsx-runtime"` that never appears in source.
// That import would be just as unreconcilable with a host app's own React
// instance as the top-level `import React from "react"` this factory is
// fixing. So every element below is built with React.createElement(...)
// (exactly what JSX desugars to) using the React namespace passed in as a
// parameter, never a module-level import of "react" as a value.
export const createDynamicModuleBoundary = (
  React: typeof ReactNamespace,
): {
  DynamicModuleBoundary: (props: DynamicModuleBoundaryProps) => ReactNamespace.ReactElement;
} => {
  type ErrorBoundaryState = { error: unknown };

  // ErrorBoundary is redefined on every createDynamicModuleBoundary call
  // rather than hoisted out as a module-level class: it extends the
  // injected `React.Component`, and React class instances/statics
  // (getDerivedStateFromError, etc.) are only valid against the exact
  // React copy they were built from. Threading a second DI parameter
  // through just for this base class would be over-engineering -- these
  // factories are called once per host app at module scope, so redefining
  // the class here has no meaningful runtime cost.
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

  const DynamicModuleBoundary = ({
    specifier,
    context,
    fallback = null,
    errorFallback = null,
    importer = defaultImporter,
  }: DynamicModuleBoundaryProps): ReactNamespace.ReactElement => {
    const LazyModule = React.lazy(async () => {
      const loadedModule = (await importer(specifier)) as ReactRuntimeModule;
      return loadedModule;
    });
    const moduleProps =
      context === undefined
        ? {}
        : ({ context } satisfies { context: RuntimeModuleContext });

    // Equivalent to:
    // <React.Suspense fallback={fallback}>
    //   <ErrorBoundary fallback={errorFallback}>
    //     <LazyModule {...moduleProps} />
    //   </ErrorBoundary>
    // </React.Suspense>
    //
    // `children` is passed inside ErrorBoundary's props object (rather than
    // as a third createElement argument) to satisfy TypeScript's overload
    // resolution, since ErrorBoundary's props type declares `children` as
    // required -- it is the same substitution JSX itself performs, not an
    // accidental extra prop.
    return React.createElement(
      React.Suspense,
      { fallback },
      React.createElement(ErrorBoundary, {
        fallback: errorFallback,
        children: React.createElement(LazyModule, moduleProps),
      }),
    );
  };

  return { DynamicModuleBoundary };
};
