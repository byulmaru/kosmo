import { beforeEach, describe, expect, test, vi } from 'vitest';
import sitemapRoutes from './sitemap';

const { createSitemapXml } = vi.hoisted(() => ({
  createSitemapXml: vi.fn<() => Promise<string>>(),
}));

vi.mock('../sitemap', () => ({ createSitemapXml }));

describe('sitemap route', () => {
  beforeEach(() => {
    createSitemapXml.mockClear();
    createSitemapXml.mockResolvedValue('<sitemap />');
  });

  test('returns XML even for browser navigation requests', async () => {
    const response = await sitemapRoutes.request('https://kos.moe/sitemap.xml', {
      headers: {
        accept: 'text/html',
        'sec-fetch-mode': 'navigate',
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/xml; charset=utf-8');
    expect(await response.text()).toBe('<sitemap />');
    expect(createSitemapXml).toHaveBeenCalledOnce();
  });

  test('rejects methods other than GET', async () => {
    const response = await sitemapRoutes.request('https://kos.moe/sitemap.xml', {
      method: 'POST',
    });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(createSitemapXml).not.toHaveBeenCalled();
  });
});
