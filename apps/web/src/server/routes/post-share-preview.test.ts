import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '@kosmo/core/db';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { postContentDocumentFromTextAndMedia } from '@kosmo/core/post-content/server';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import type { Hono } from 'hono';

vi.mock('@kosmo/core/local-instance', () => ({
  resolveConfiguredLocalInstance: vi.fn(),
}));
vi.mock('../sentry', () => ({ captureUnexpectedError: vi.fn() }));

const postId = '00000000-0000-8000-8000-000000000001';
const mediaId = '00000000-0000-8000-8000-000000000002';
const path = `/@alice/${encodeGlobalId('Post', postId)}`;
let staticRoot: string;
let routes: Hono;

beforeAll(async () => {
  staticRoot = await mkdtemp(join(tmpdir(), 'kosmo-share-preview-'));
  await writeFile(
    join(staticRoot, 'index.html'),
    '<html><head><!-- kosmo-share-metadata:start --><!-- kosmo-share-metadata:end --></head><body>app shell</body></html>',
  );
  vi.stubEnv('EXPO_WEB_ROOT', staticRoot);
  ({ default: routes } = await import('./post-share-preview'));
});

afterAll(async () => {
  await rm(staticRoot, { recursive: true, force: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  vi.mocked(resolveConfiguredLocalInstance).mockReset();
});

test.each([
  ['text/html;q=0.8, application/activity+json;q=0.5', 200],
  ['text/html, application/activity+json', 200],
  ['application/activity+json, text/html', 404],
  ['text/html;q=0.5, application/activity+json;q=0.8', 404],
  ['text/html, application/activity+json;q=0', 200],
  ['text/html;q=0, */*;q=1', 404],
  ['text/*', 200],
  ['application/*', 404],
  ['application/ld+json;q=0.5, text/html;q=0.8', 200],
  ['application/json;q=0.8, text/html;q=0.5', 404],
  ['*/*;q=1, application/activity+json;q=0.5', 404],
])('selects the requested representation for Accept %s', async (accept, status) => {
  vi.stubEnv('PUBLIC_ORIGIN', 'https://kos.moe');
  vi.mocked(resolveConfiguredLocalInstance).mockRejectedValueOnce(
    new Error('database unavailable'),
  );
  const response = await routes.request(path, { headers: { accept } });
  expect(response.status).toBe(status);
  if (status === 200) {
    expect(await response.text()).toContain('app shell');
    expect(response.headers.get('content-type')).toContain('text/html');
  }
});

test.each([
  ['https://media.example/image.png', 'https://media.example/image.png'],
  ['http://localhost/image.png', 'http://localhost/image.png'],
  ['http://192.168.0.1/image.png', 'http://192.168.0.1/image.png'],
  ['https://media.example/image.png#fragment', 'https://media.example/image.png'],
  ['https://media.example/image.png?a=1&b=2', 'https://media.example/image.png?a=1&amp;b=2'],
  ['not a URL', 'https://kos.moe/og-default.png'],
  ['data:image/png;base64,AAAA', 'https://kos.moe/og-default.png'],
  ['file:///image.png', 'https://kos.moe/og-default.png'],
  ['https://user@media.example/image.png', 'https://kos.moe/og-default.png'],
  ['https://:secret@media.example/image.png', 'https://kos.moe/og-default.png'],
])('projects attachment URL %s as %s', async (url, expectedImage) => {
  vi.stubEnv('PUBLIC_ORIGIN', 'https://kos.moe');
  vi.mocked(resolveConfiguredLocalInstance).mockResolvedValueOnce({ id: 'local' } as never);
  const rows = [
    [
      {
        authorDisplayName: 'Alice',
        authorHandle: 'alice',
        authorInstanceId: 'local',
        authorInstanceJoinedId: 'local',
        authorInstanceDomain: 'kos.moe',
        contentDocument: postContentDocumentFromTextAndMedia('public body', [{ mediaId }]),
        currentContentId: 'content',
        postId,
        replyParentId: null,
        repostSourceId: null,
      },
    ],
    [{ id: mediaId, altText: 'attachment alt', mediaType: 'image/png', state: 'READY', url }],
  ];
  vi.spyOn(db, 'select').mockImplementation(() => {
    const result = Promise.resolve(rows.shift());
    const query = {
      from: () => query,
      innerJoin: () => query,
      leftJoin: () => query,
      where: () => query,
      limit: () => result,
      then: result.then.bind(result),
    };
    return query as unknown as ReturnType<typeof db.select>;
  });
  const response = await routes.request(path);
  const html = await response.text();
  expect(response.status).toBe(200);
  expect(html).toContain('public body');
  expect(html).toContain(`property="og:image" content="${expectedImage}"`);
  expect(html).toContain(`name="twitter:image" content="${expectedImage}"`);
  if (expectedImage === 'https://kos.moe/og-default.png') {
    expect(html).not.toContain('attachment alt');
    expect(html).not.toContain(url);
  } else {
    expect(html).toContain('attachment alt');
    expect(html).not.toContain('#fragment');
  }
});

test.each([
  [null, true, 'public body with sensitive media'],
  ['spoiler warning', false, '열람 주의 문구: spoiler warning'],
  ['spoiler warning', true, '열람 주의 문구: spoiler warning'],
])(
  'preserves post metadata for warning %s and sensitive media %s',
  async (summary, sensitive, description) => {
    vi.stubEnv('PUBLIC_ORIGIN', 'https://kos.moe');
    vi.mocked(resolveConfiguredLocalInstance).mockResolvedValueOnce({ id: 'local' } as never);
    const rows = [
      {
        authorDisplayName: 'uta',
        authorHandle: 'uta',
        authorInstanceId: 'local',
        authorInstanceJoinedId: 'local',
        authorInstanceDomain: 'kos.moe',
        contentDocument: postContentDocumentFromTextAndMedia(
          'public body with sensitive media',
          [{ mediaId }],
          sensitive,
          summary,
        ),
        currentContentId: 'content',
        postId,
        replyParentId: null,
        repostSourceId: null,
      },
    ];
    vi.spyOn(db, 'select').mockImplementation(() => {
      const result = Promise.resolve(rows);
      const query = {
        from: () => query,
        innerJoin: () => query,
        leftJoin: () => query,
        where: () => query,
        limit: () => result,
      };
      return query as unknown as ReturnType<typeof db.select>;
    });
    const response = await routes.request(path);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('<title>uta(@uta) on KOSMO</title>');
    expect(html).toContain('property="og:title" content="uta(@uta) on KOSMO"');
    expect(html).toContain('name="twitter:title" content="uta(@uta) on KOSMO"');
    expect(html).toContain('property="og:type" content="article"');
    expect(html).toContain(`name="description" content="${description}"`);
    expect(html).toContain(`property="og:description" content="${description}"`);
    expect(html).toContain(`name="twitter:description" content="${description}"`);
    expect(html).toContain('property="og:image" content="https://kos.moe/og-default.png"');
    if (summary) {
      expect(html).not.toContain('public body with sensitive media');
    }
  },
);
