import type {
  RuntimeCompositionManifest,
  RuntimeRouteMatch,
  SliceConfig,
} from "./types.js";

const normalizePath = (path: string): string => {
  const withoutHash = path.split("#")[0] ?? "/";
  const withoutSearch = withoutHash.split("?")[0] ?? "/";
  const normalized = withoutSearch.startsWith("/")
    ? withoutSearch
    : `/${withoutSearch}`;
  return normalized.length > 1 && normalized.endsWith("/")
    ? normalized.slice(0, -1)
    : normalized;
};

const routePatternsFor = (slice: SliceConfig): string[] =>
  Array.isArray(slice.route) ? slice.route : [slice.route];

const matchRoutePattern = (
  pattern: string,
  pathname: string,
): { matched: boolean; params: Record<string, string>; score: number } => {
  const normalizedPattern = normalizePath(pattern);
  const normalizedPathname = normalizePath(pathname);

  if (normalizedPattern.endsWith("/*")) {
    const prefix = normalizedPattern.slice(0, -2);
    return {
      matched:
        normalizedPathname === prefix ||
        normalizedPathname.startsWith(`${prefix}/`),
      params: {},
      score: prefix.length,
    };
  }

  if (normalizedPattern === normalizedPathname) {
    return {
      matched: true,
      params: {},
      score: normalizedPattern.length + 1000,
    };
  }

  return {
    matched: false,
    params: {},
    score: -1,
  };
};

export const resolveRoute = (
  manifest: RuntimeCompositionManifest,
  path: string,
): RuntimeRouteMatch | null => {
  const matches: Array<RuntimeRouteMatch & { score: number }> = [];

  for (const [sliceName, slice] of Object.entries(manifest.slices)) {
    for (const route of routePatternsFor(slice)) {
      const match = matchRoutePattern(route, path);
      if (match.matched) {
        matches.push({
          sliceName,
          slice,
          specifier: slice.specifier,
          route,
          params: match.params,
          score: match.score,
        });
      }
    }
  }

  const [bestMatch] = matches.sort((a, b) => b.score - a.score);
  if (!bestMatch) {
    return null;
  }

  const { score: _score, ...routeMatch } = bestMatch;
  return routeMatch;
};

