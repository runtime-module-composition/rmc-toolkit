import React from "@esm.sh/react";
import type { RuntimeModuleContext } from "@runtime-module-composition/core";

// React.createElement instead of JSX here to avoid needing a JSX runtime
// configured for this minimal fixture — real slices typically use JSX.
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
