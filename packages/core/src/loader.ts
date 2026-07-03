import type {
  DynamicImporter,
  RuntimeModule,
  RuntimeModuleNamespace,
} from "./types.js";

const defaultImporter: DynamicImporter = (specifier) =>
  import(/* @vite-ignore */ specifier);

export const unwrapRuntimeModule = (value: unknown): RuntimeModule => {
  const moduleNamespace = value as Partial<RuntimeModuleNamespace>;
  const candidate =
    "default" in moduleNamespace ? moduleNamespace.default : moduleNamespace;

  if (
    !candidate ||
    typeof candidate !== "object" ||
    typeof (candidate as RuntimeModule).mount !== "function"
  ) {
    throw new TypeError(
      "Runtime module must export a mount(target, context) function.",
    );
  }

  return candidate as RuntimeModule;
};

export const loadRuntimeModule = async (
  specifier: string,
  importer: DynamicImporter = defaultImporter,
): Promise<RuntimeModule> => unwrapRuntimeModule(await importer(specifier));

