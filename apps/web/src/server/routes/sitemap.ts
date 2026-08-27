import { Hono } from 'hono';
import { createSitemapXml } from '../sitemap';

const sitemapRoutes = new Hono();

sitemapRoutes.get('/sitemap.xml', async (c) => {
  const xml = await createSitemapXml();
  return c.body(xml, 200, { 'Content-Type': 'application/xml; charset=utf-8' });
});

sitemapRoutes.all('/sitemap.xml', (c) => c.text('Method Not Allowed', 405, { Allow: 'GET' }));

export default sitemapRoutes;
