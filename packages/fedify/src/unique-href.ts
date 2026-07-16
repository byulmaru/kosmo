export const uniqueHref = (uris: URL[]): string | undefined => {
  const hrefs = new Set(uris.map((uri) => uri.href));

  return hrefs.size === 1 ? hrefs.values().next().value : undefined;
};
