import React from "@esm.sh/react";
import type { RuntimeModuleContext } from "@runtime-module-composition/core";

const SearchSlice = ({
  context,
}: {
  context?: RuntimeModuleContext;
}): React.ReactElement =>
  React.createElement(
    "div",
    { "data-slice": "search" },
    `Search slice loaded for route ${context?.route?.route ?? "unknown"}`,
  );

export default SearchSlice;
