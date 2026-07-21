export const isHttpUri = (uri: URL | null): uri is URL =>
  uri !== null && (uri.protocol === 'http:' || uri.protocol === 'https:');

export const uniqueHref = (uris: URL[]): string | undefined => {
  const hrefs = new Set(uris.map((uri) => uri.href));

  return hrefs.size === 1 ? hrefs.values().next().value : undefined;
};
