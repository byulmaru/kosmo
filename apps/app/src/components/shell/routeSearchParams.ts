type SearchParams = Record<string, string | string[] | undefined>;

export function withoutDynamicRouteParams(
  searchParams: SearchParams,
  routeSegments: readonly string[],
) {
  const queryParams = { ...searchParams };
  for (const segment of routeSegments) {
    const param = getDynamicRouteParam(segment);
    if (param) {
      delete queryParams[param];
    }
  }
  return queryParams;
}

function getDynamicRouteParam(segment: string) {
  if (segment.startsWith('[[...') && segment.endsWith(']]')) {
    return segment.slice(5, -2);
  }
  if (segment.startsWith('[...') && segment.endsWith(']')) {
    return segment.slice(4, -1);
  }
  if (segment.startsWith('[') && segment.endsWith(']')) {
    return segment.slice(1, -1);
  }
  return null;
}
