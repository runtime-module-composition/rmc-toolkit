import {
  importModule,
  type DynamicImporter,
  type RuntimeModuleContext,
} from "@runtime-module-composition/core";
import React from "react";

type ReactRuntimeModule = {
  default: React.ComponentType<{ context?: RuntimeModuleContext }>;
};

export type DynamicModuleBoundaryProps = {
  specifier: string;
  context?: RuntimeModuleContext;
  fallback?: React.ReactNode;
  errorFallback?: React.ReactNode;
  importer?: DynamicImporter;
};

type ErrorBoundaryState = {
  error: unknown;
};

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error };
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

const defaultImporter: DynamicImporter = importModule;

export const DynamicModuleBoundary = ({
  specifier,
  context,
  fallback = null,
  errorFallback = null,
  importer = defaultImporter,
}: DynamicModuleBoundaryProps): React.ReactElement => {
  const LazyModule = React.lazy(async () => {
    const loadedModule = (await importer(specifier)) as ReactRuntimeModule;
    return loadedModule;
  });
  const moduleProps =
    context === undefined
      ? {}
      : ({ context } satisfies { context: RuntimeModuleContext });

  return (
    <React.Suspense fallback={fallback}>
      <ErrorBoundary fallback={errorFallback}>
        <LazyModule {...moduleProps} />
      </ErrorBoundary>
    </React.Suspense>
  );
};
