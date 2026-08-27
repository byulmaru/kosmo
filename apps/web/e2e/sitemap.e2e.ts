import { db, firstOrThrow, PostContents, Posts } from '@kosmo/core/db';
import { PostState, PostVisibility, ProfileState } from '@kosmo/core/enums';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { eq } from 'drizzle-orm';
import {
  createE2EPost,
  createE2EProfile,
  createE2ERemoteProfile,
  resetE2EDatabase,
} from './db-fixtures';
import { expect, test } from './fixtures';

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test('serves only canonical public profile and post URLs with eligible revision metadata', async ({
  request,
}) => {
  const localProfile = await createE2EProfile({ handle: 'sitemap-owner' });
  const disabledProfile = await createE2EProfile({
    handle: 'sitemap-disabled',
    state: ProfileState.DISABLED,
  });
  const suspendedProfile = await createE2EProfile({
    handle: 'sitemap-suspended',
    state: ProfileState.SUSPENDED,
  });
  const remoteProfile = await createE2ERemoteProfile({ handle: 'sitemap-remote' });

  const createdAt = '2026-08-27T12:34:56Z';
  const publicPost = await createE2EPost({
    body: 'public sitemap post',
    createdAt,
    profileId: localProfile.id,
  });
  const unlistedPost = await createE2EPost({
    body: 'unlisted sitemap post',
    profileId: localProfile.id,
    visibility: PostVisibility.UNLISTED,
  });
  const deletedPost = await createE2EPost({
    body: 'deleted sitemap post',
    profileId: localProfile.id,
    state: PostState.DELETED,
  });
  const disabledPost = await createE2EPost({
    body: 'disabled author post',
    profileId: disabledProfile.id,
  });
  const suspendedPost = await createE2EPost({
    body: 'suspended author post',
    profileId: suspendedProfile.id,
  });
  const remotePost = await createE2EPost({
    body: 'remote post',
    profileId: remoteProfile.id,
  });
  const repostSource = await createE2EPost({
    body: 'repost source',
    profileId: localProfile.id,
  });
  const contentlessRepost = await db
    .insert(Posts)
    .values({
      profileId: localProfile.id,
      repostSourceId: repostSource.id,
      state: PostState.ACTIVE,
      visibility: PostVisibility.PUBLIC,
    })
    .returning()
    .then(firstOrThrow);
  const deletedParent = await createE2EPost({
    body: 'deleted parent',
    profileId: localProfile.id,
    state: PostState.DELETED,
  });
  const reply = await createE2EPost({
    body: 'reply with deleted parent',
    profileId: localProfile.id,
    replyParentId: deletedParent.id,
  });
  const deletedQuoteSource = await createE2EPost({
    body: 'deleted quote source',
    profileId: localProfile.id,
    state: PostState.DELETED,
  });
  const quote = await db.transaction(async (tx) => {
    const post = await tx
      .insert(Posts)
      .values({
        profileId: localProfile.id,
        repostSourceId: deletedQuoteSource.id,
        state: PostState.ACTIVE,
        visibility: PostVisibility.PUBLIC,
      })
      .returning()
      .then(firstOrThrow);
    const content = await tx
      .insert(PostContents)
      .values({
        document: postContentDocumentFromText('quote with deleted source'),
        postId: post.id,
      })
      .returning()
      .then(firstOrThrow);

    return tx
      .update(Posts)
      .set({ currentContentId: content.id })
      .where(eq(Posts.id, post.id))
      .returning()
      .then(firstOrThrow);
  });

  const crawlerResponse = await request.get('/sitemap.xml');
  const browserNavigationResponse = await request.get('/sitemap.xml', {
    headers: { accept: 'text/html', 'sec-fetch-mode': 'navigate' },
  });

  expect(crawlerResponse.status()).toBe(200);
  expect(crawlerResponse.headers()['content-type']).toBe('application/xml; charset=utf-8');
  expect(browserNavigationResponse.status()).toBe(200);
  expect(browserNavigationResponse.headers()['content-type']).toBe(
    'application/xml; charset=utf-8',
  );

  const xml = await crawlerResponse.text();
  expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset /);
  expect(xml).not.toContain('<html');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => decodeXml(loc!));
  expect(locs.length).toBeLessThanOrEqual(50_000);
  expect(Buffer.byteLength(xml, 'utf8')).toBeLessThanOrEqual(52_428_800);
  const origin = new URL(crawlerResponse.url()).origin;
  const expectedPostUrl = (postId: string) =>
    `${origin}/%40sitemap-owner/${encodeGlobalId('Post', postId)}`;

  expect(locs).toContain(`${origin}/`);
  expect(locs).toContain(`${origin}/privacy`);
  expect(locs).toContain(`${origin}/%40sitemap-owner`);
  expect(locs).not.toContain(`${origin}/%40sitemap-disabled`);
  expect(locs).not.toContain(`${origin}/%40sitemap-suspended`);
  expect(locs).not.toContain(`${origin}/%40sitemap-remote`);
  expect(locs).toContain(expectedPostUrl(publicPost.id));
  expect(locs).toContain(expectedPostUrl(reply.id));
  expect(locs).toContain(expectedPostUrl(quote.id));
  expect(locs).toContain(expectedPostUrl(repostSource.id));
  expect(locs).not.toContain(expectedPostUrl(unlistedPost.id));
  expect(locs).not.toContain(expectedPostUrl(deletedPost.id));
  expect(locs).not.toContain(expectedPostUrl(disabledPost.id));
  expect(locs).not.toContain(expectedPostUrl(suspendedPost.id));
  expect(locs).not.toContain(
    `${origin}/%40sitemap-remote/${encodeGlobalId('Post', remotePost.id)}`,
  );
  expect(locs).not.toContain(expectedPostUrl(contentlessRepost.id));
  expect(locs).not.toContain(expectedPostUrl(deletedParent.id));
  expect(locs).not.toContain(expectedPostUrl(deletedQuoteSource.id));
  expect(xml).toContain(`<lastmod>${createdAt}</lastmod>`);
  expect(xml.match(/<lastmod>/g)).toHaveLength(4);
  expect(await browserNavigationResponse.text()).toBe(xml);
});

function decodeXml(value: string) {
  return value
    .replaceAll('&apos;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
}
