export const SITEMAP_URL_LIMIT = 50_000;
export const SITEMAP_BYTE_LIMIT = 52_428_800;

export type SitemapEntry = {
  url: string;
  lastmod?: Temporal.Instant;
};

export const buildSitemapUrl = (origin: string, ...segments: string[]) => {
  const originUrl = new URL(origin);
  if (originUrl.protocol !== 'http:' && originUrl.protocol !== 'https:') {
    throw new Error('Sitemap URLs must use HTTP or HTTPS');
  }

  const path = segments.map((segment) => encodeURIComponent(segment)).join('/');
  return new URL(`/${path}`, originUrl).href;
};

const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

export const serializeSitemap = (entries: readonly SitemapEntry[]) => {
  const seenUrls = new Set<string>();
  const uniqueEntries = entries.filter(({ url }) => {
    if (seenUrls.has(url)) {
      return false;
    }

    seenUrls.add(url);
    return true;
  });

  if (uniqueEntries.length > SITEMAP_URL_LIMIT) {
    throw new Error(`Sitemap contains more than ${SITEMAP_URL_LIMIT.toLocaleString()} URLs`);
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...uniqueEntries.flatMap(({ lastmod, url }) => [
      '  <url>',
      `    <loc>${escapeXml(url)}</loc>`,
      ...(lastmod ? [`    <lastmod>${escapeXml(lastmod.toString())}</lastmod>`] : []),
      '  </url>',
    ]),
    '</urlset>',
    '',
  ].join('\n');

  const byteLength = Buffer.byteLength(xml, 'utf8');
  if (byteLength > SITEMAP_BYTE_LIMIT) {
    throw new Error(`Sitemap is larger than ${SITEMAP_BYTE_LIMIT.toLocaleString()} UTF-8 bytes`);
  }

  return xml;
};
