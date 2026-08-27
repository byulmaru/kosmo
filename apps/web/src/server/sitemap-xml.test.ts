import '@kosmo/core/polyfill';

import { describe, expect, test } from 'vitest';
import {
  buildSitemapUrl,
  serializeSitemap,
  SITEMAP_BYTE_LIMIT,
  SITEMAP_URL_LIMIT,
} from './sitemap-xml';

describe('sitemap XML', () => {
  test('percent-encodes path segments independently', () => {
    expect(buildSitemapUrl('https://kos.moe', '@alice&team', 'post/id')).toBe(
      'https://kos.moe/%40alice%26team/post%2Fid',
    );
  });

  test('rejects non-HTTP sitemap origins', () => {
    expect(() => buildSitemapUrl('ftp://kos.moe', 'alice')).toThrow(/HTTP or HTTPS/);
  });

  test('serializes the sitemap declaration, namespace, escaped loc, and trusted lastmod', () => {
    const xml = serializeSitemap([
      {
        lastmod: Temporal.Instant.from('2026-08-27T00:00:00Z'),
        url: 'https://kos.moe/post?a=1&b=2',
      },
    ]);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<loc>https://kos.moe/post?a=1&amp;b=2</loc>');
    expect(xml).toContain('<lastmod>2026-08-27T00:00:00Z</lastmod>');
    expect(xml).not.toContain('<changefreq>');
    expect(xml).not.toContain('<priority>');
  });

  test('deduplicates URLs while retaining one url element', () => {
    const xml = serializeSitemap([
      { url: 'https://kos.moe/' },
      { url: 'https://kos.moe/' },
      { url: 'https://kos.moe/privacy' },
    ]);

    expect(xml.match(/<url>/g)).toHaveLength(2);
  });

  test('rejects more than the protocol URL limit without truncating', () => {
    const entries = Array.from({ length: SITEMAP_URL_LIMIT + 1 }, (_, index) => ({
      url: `https://kos.moe/${index}`,
    }));

    expect(() => serializeSitemap(entries)).toThrow(/50,000/);
  });

  test('rejects XML larger than the protocol byte limit without truncating', () => {
    const oversizedUrl = `https://kos.moe/${'a'.repeat(SITEMAP_BYTE_LIMIT)}`;

    expect(() => serializeSitemap([{ url: oversizedUrl }])).toThrow(/byte/i);
  });
});
