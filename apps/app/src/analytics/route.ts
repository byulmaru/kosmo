export function normalizeRouteTemplate(segments: readonly string[]): string {
  const visibleSegments = segments.filter(
    (segment) => segment !== 'index' && !(segment.startsWith('(') && segment.endsWith(')')),
  );

  return visibleSegments.length > 0 ? `/${visibleSegments.join('/')}` : '/';
}

export function isNewRouteTemplate(
  previousRouteTemplate: string | null,
  routeTemplate: string,
): boolean {
  return previousRouteTemplate !== routeTemplate;
}
