// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: "npm",
  testRunner: "vitest",
  vitest: {
    dir: "packages/core",
  },
  coverageAnalysis: "perTest",
  mutate: [
    "packages/core/src/**/*.ts",
    "!packages/core/src/**/*.test.ts",
    "!packages/core/src/**/*.d.ts",
  ],
  reporters: ["html", "clear-text", "progress"],
  htmlReporter: {
    fileName: "reports/mutation/index.html",
  },
  tempDirName: ".stryker-tmp",
};
