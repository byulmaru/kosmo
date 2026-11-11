import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '@kosmo/core/db';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { postContentDocumentFromTextAndMedia } from '@kosmo/core/post-content/server';
import { resolveActivityPubPostUri } from '@kosmo/fedify';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { captureUnexpectedError } from '../sentry';
import type { Hono } from 'hono';

vi.mock('@kosmo/core/local-instance', () => ({
  resolveConfiguredLocalInstance: vi.fn(),
}));
vi.mock('@kosmo/fedify', () => ({ resolveActivityPubPostUri: vi.fn() }));
vi.mock('../sentry', () => ({ captureUnexpectedError: vi.fn() }));

const postId = '00000000-0000-8000-8000-000000000001';
const postSlug = 'Abc123dEf456';
const mediaId = '00000000-0000-8000-8000-000000000002';
const path = `/@alice/${encodeGlobalId('Post', postId)}`;
const slugPath = `/@alice/${postSlug}`;
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
  vi.mocked(resolveActivityPubPostUri).mockReset();
  vi.mocked(captureUnexpectedError).mockClear();
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

test('slug and legacy global-ID URLs resolve to the same canonical Post preview', async () => {
  vi.stubEnv('PUBLIC_ORIGIN', 'https://kos.moe');
  vi.mocked(resolveConfiguredLocalInstance).mockResolvedValue({ id: 'local' } as never);
  vi.mocked(resolveActivityPubPostUri).mockResolvedValue(
    new URL(`https://ap.example/notes/${postId}`),
  );
  const row = {
    authorDisplayName: 'Alice',
    authorHandle: 'alice',
    authorInstanceId: 'local',
    authorInstanceJoinedId: 'local',
    authorInstanceDomain: 'kos.moe',
    contentDocument: postContentDocumentFromTextAndMedia('public body', []),
    currentContentId: 'content',
    postId,
    slug: postSlug,
    replyParentId: null,
    repostSourceId: null,
  };
  vi.spyOn(db, 'select').mockImplementation(() => {
    const result = Promise.resolve([row]);
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

  const legacyResponse = await routes.request(path);
  const slugResponse = await routes.request(slugPath);
  const legacyHtml = await legacyResponse.text();
  const slugHtml = await slugResponse.text();

  expect(legacyResponse.status).toBe(200);
  expect(slugResponse.status).toBe(200);
  expect(slugHtml).toBe(legacyHtml);
  expect(slugHtml).toContain(`property="og:url" content="https://kos.moe/@alice/${postSlug}"`);
  expect(slugHtml).toContain(`href="https://ap.example/notes/${postId}"`);
  expect(slugHtml).toContain('public body');
});

test.each([
  [
    'https://media.example/image.png',
    'https://media.example/image.png',
    'https://media.example/image.png',
  ],
  ['http://localhost/image.png', 'http://localhost/image.png', 'http://localhost/image.png'],
  ['http://192.168.0.1/image.png', 'http://192.168.0.1/image.png', 'http://192.168.0.1/image.png'],
  [
    'https://media.example/image.png#fragment',
    'https://media.example/image.png',
    'https://media.example/image.png',
  ],
  [
    'https://media.example/image.png?a=1&b=2',
    'https://media.example/image.png?a=1&amp;b=2',
    'https://media.example/image.png?a=1&b=2',
  ],
  ['not a URL', 'https://kos.moe/og-default.png', 'https://kos.moe/og-default.png'],
  [
    'data:image/png;base64,AAAA',
    'https://kos.moe/og-default.png',
    'https://kos.moe/og-default.png',
  ],
  ['file:///image.png', 'https://kos.moe/og-default.png', 'https://kos.moe/og-default.png'],
  [
    'https://user@media.example/image.png',
    'https://kos.moe/og-default.png',
    'https://kos.moe/og-default.png',
  ],
  [
    'https://:secret@media.example/image.png',
    'https://kos.moe/og-default.png',
    'https://kos.moe/og-default.png',
  ],
])('projects attachment URL %s', async (url, expectedHtmlImage, expectedJsonLdImage) => {
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
        slug: postSlug,
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
  expect(html).toContain(`property="og:image" content="${expectedHtmlImage}"`);
  expect(html).toContain(`name="twitter:image" content="${expectedHtmlImage}"`);
  if (expectedHtmlImage === 'https://kos.moe/og-default.png') {
    expect(html).not.toContain('attachment alt');
    expect(html).not.toContain(url);
  } else {
    expect(html).toContain('attachment alt');
    expect(html).not.toContain('#fragment');
  }
  expect(parseJsonLd(html)['@graph']).toEqual([
    { '@type': 'ImageObject', contentUrl: expectedJsonLdImage },
  ]);
});

test('escapes hostile image alt text in share metadata attributes', async () => {
  vi.stubEnv('PUBLIC_ORIGIN', 'https://kos.moe');
  vi.mocked(resolveConfiguredLocalInstance).mockResolvedValueOnce({ id: 'local' } as never);
  const altText = `" ' onerror="alert(1)"><img src=x onerror="alert(1)">`;
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
        slug: postSlug,
        replyParentId: null,
        repostSourceId: null,
      },
    ],
    [
      {
        id: mediaId,
        altText,
        mediaType: 'image/png',
        state: 'READY',
        url: 'https://media.example/image.png',
      },
    ],
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

  const response = await routes.request(path, { method: 'GET' });
  const html = await response.text();
  const escapedAltText =
    '&quot; &#39; onerror=&quot;alert(1)&quot;&gt;&lt;img src=x onerror=&quot;alert(1)&quot;&gt;';

  expect(response.status).toBe(200);
  expect(html).toContain(`<meta property="og:image:alt" content="${escapedAltText}" />`);
  expect(html).toContain(`<meta name="twitter:image:alt" content="${escapedAltText}" />`);
  expect(html).not.toContain('<img');
  expect(html).not.toContain('onerror="alert(1)">');
});

test.each([
  [null, true, 'resolved', 'public body with sensitive media'],
  ['spoiler warning', false, 'throws', '열람 주의 문구: spoiler warning'],
  ['spoiler warning', true, 'missing', '열람 주의 문구: spoiler warning'],
])(
  'preserves post metadata for warning %s and sensitive media %s with ActivityPub URI lookup %s and description %s',
  async (summary, sensitive, activityPubUriResult, description) => {
    vi.stubEnv('PUBLIC_ORIGIN', 'https://kos.moe');
    vi.mocked(resolveConfiguredLocalInstance).mockResolvedValueOnce({ id: 'local' } as never);
    if (activityPubUriResult === 'resolved') {
      vi.mocked(resolveActivityPubPostUri).mockResolvedValueOnce(
        new URL('https://ap.example/objects/post?a=1&b=2'),
      );
    } else if (activityPubUriResult === 'throws') {
      vi.mocked(resolveActivityPubPostUri).mockRejectedValueOnce(
        new Error('ActivityPub URI lookup failed'),
      );
    } else {
      vi.mocked(resolveActivityPubPostUri).mockResolvedValueOnce(undefined);
    }
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
        slug: postSlug,
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
    if (activityPubUriResult === 'resolved') {
      expect(html).toMatch(
        /<link\s+rel="alternate"\s+type="application\/activity\+json"\s+href="https:\/\/ap\.example\/objects\/post\?a=1&amp;b=2"\s+\/>/,
      );
      expect(html.match(/<link\s+rel="alternate"/g) ?? []).toHaveLength(1);
    } else {
      expect(html).not.toMatch(/<link\s+rel="alternate"/);
    }
    if (activityPubUriResult === 'throws') {
      expect(captureUnexpectedError).toHaveBeenCalledOnce();
    }
    if (summary) {
      expect(html).not.toContain('public body with sensitive media');
    }
  },
);

test('uses stored Media attribution metadata for every visible image on a repost preview', async () => {
  vi.stubEnv('PUBLIC_ORIGIN', 'https://kos.moe');
  vi.mocked(resolveConfiguredLocalInstance).mockResolvedValueOnce({ id: 'local' } as never);
  const sourcePostId = '00000000-0000-8000-8000-000000000003';
  const sourceSlug = 'source123abc';
  const repostPostId = '00000000-0000-8000-8000-000000000004';
  const repostSlug = 'repost123abc';
  const secondMediaId = '00000000-0000-8000-8000-000000000005';
  const originalImageUrl = 'https://media.example/original.png';
  const secondImageUrl = 'https://media.example/second.png';
  const attributionUrl = 'https://profiles.example/@first-author?profile=public&view=full';
  const attributionName = 'First Author </script><script>alert("owned")</script>';
  const repostPath = `/@reposter/${encodeGlobalId('Post', repostPostId)}`;
  const rows = [
    [
      {
        authorDisplayName: 'Reposter',
        authorHandle: 'reposter',
        authorInstanceId: 'local',
        authorInstanceJoinedId: 'local',
        authorInstanceDomain: 'kos.moe',
        contentDocument: null,
        currentContentId: null,
        postId: repostPostId,
        slug: repostSlug,
        replyParentId: null,
        repostSourceId: sourcePostId,
      },
    ],
    [
      {
        authorDisplayName: 'Source author',
        authorHandle: 'source',
        authorInstanceId: 'local',
        authorInstanceJoinedId: 'local',
        authorInstanceDomain: 'kos.moe',
        contentDocument: postContentDocumentFromTextAndMedia('source body', [
          { mediaId },
          { mediaId: secondMediaId },
        ]),
        currentContentId: 'source-content',
        postId: sourcePostId,
        slug: sourceSlug,
        replyParentId: null,
        repostSourceId: null,
      },
    ],
    [
      {
        id: mediaId,
        altText: null,
        mediaType: 'image/png',
        state: 'READY',
        url: originalImageUrl,
        publicationMetadata: {
          attributionName,
          attributionUrl,
          rights: { personal: 'ORIGINAL', noncommercial: 'DENY', commercial: 'DENY' },
        },
      },
      {
        id: secondMediaId,
        altText: null,
        mediaType: 'image/png',
        state: 'READY',
        url: secondImageUrl,
        publicationMetadata: null,
      },
    ],
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

  const response = await routes.request(repostPath);
  const html = await response.text();
  const structuredData = parseJsonLd(html);
  const imageObjects = structuredData['@graph'] as Record<string, unknown>[];

  expect(response.status).toBe(200);
  expect(imageObjects).toEqual([
    {
      '@type': 'ImageObject',
      contentUrl: originalImageUrl,
      creditText: `${attributionName} (${attributionUrl})`,
      license:
        'https://profiles.example/terms/image-use/v1?personal=ORIGINAL&noncommercial=DENY&commercial=DENY',
    },
    { '@type': 'ImageObject', contentUrl: secondImageUrl },
  ]);
  expect(html).toContain('\\u003c/script\\u003e\\u003cscript\\u003e');
  expect(html.match(/<script/g) ?? []).toHaveLength(1);
  expect(html).not.toContain('<script>alert("owned")</script>');
  expect(structuredData).not.toHaveProperty('creator');
  expect(html).not.toContain('Reposter');
});

function parseJsonLd(html: string): Record<string, unknown> {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match?.[1]) {
    throw new Error('Share preview did not include JSON-LD.');
  }
  return JSON.parse(match[1]) as Record<string, unknown>;
}
