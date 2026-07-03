export type ImportMap = {
  imports: Record<string, string>;
  scopes?: Record<string, Record<string, string>>;
};

export type RuntimeEnvironment = "development" | "preview" | "production";

export type EnvironmentUrlMap = Partial<Record<RuntimeEnvironment, string>>;

export type SharedDependencyConfig =
  | string
  | {
      url: string;
      environments?: EnvironmentUrlMap;
      external?: boolean;
    };

export type SliceConfig = {
  route: string | string[];
  specifier: string;
  entry: string;
  external?: boolean;
};

export type RuntimeCompositionManifest = {
  namespace: string;
  assetsOrigin: string;
  shared?: Record<string, SharedDependencyConfig>;
  slices: Record<string, SliceConfig>;
};

export type RuntimeRouteMatch = {
  sliceName: string;
  slice: SliceConfig;
  specifier: string;
  route: string;
  params: Record<string, string>;
};

export type RuntimeCompositionDiagnostic = {
  level: "error" | "warning";
  code: string;
  message: string;
};

export type RuntimeModuleContext = {
  route?: RuntimeRouteMatch;
  manifest?: RuntimeCompositionManifest;
  data?: unknown;
};

export type RuntimeModule = {
  mount(target: Element, context?: RuntimeModuleContext): void | Promise<void>;
  unmount?(): void | Promise<void>;
};

export type RuntimeModuleNamespace = RuntimeModule | { default: RuntimeModule };

export type DynamicImporter = (specifier: string) => Promise<unknown>;

