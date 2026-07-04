import { describe, expect, test, vi } from "vitest";
import { importModule, unwrapDefault } from "./loader.js";

describe("importModule", () => {
  test("uses the default importer to call native dynamic import", async () => {
    const namespace = (await importModule(
      "./__fixtures__/dummy-module.js",
    )) as Record<string, unknown>;
    expect(namespace.default).toBe("default-value");
    expect(namespace.namedExport).toBe("named-value");
  });

  test("uses a custom importer when provided", async () => {
    const customImporter = vi.fn(async (specifier: string) => ({
      default: `loaded:${specifier}`,
    }));

    const result = await importModule("some-specifier", customImporter);

    expect(customImporter).toHaveBeenCalledWith("some-specifier");
    expect(result).toEqual({ default: "loaded:some-specifier" });
  });
});

describe("unwrapDefault", () => {
  test("returns the default export when present", () => {
    expect(unwrapDefault({ default: "the-value" })).toBe("the-value");
  });

  test("returns the namespace itself when there is no default export", () => {
    const namespace = { namedExport: "value" };
    expect(unwrapDefault(namespace)).toBe(namespace);
  });

  test("returns non-object values unchanged", () => {
    expect(unwrapDefault(null)).toBe(null);
    expect(unwrapDefault(undefined)).toBe(undefined);
    expect(unwrapDefault("plain-string")).toBe("plain-string");
  });
});
