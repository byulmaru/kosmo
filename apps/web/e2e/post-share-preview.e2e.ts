import { db, Posts } from '@kosmo/core/db';
import { InstanceState, PostState, PostVisibility } from '@kosmo/core/enums';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { eq } from 'drizzle-orm';
import {
  createE2EPost,
  createE2EProfile,
  createE2ERemoteProfile,
  createE2ESession,
  resetE2EDatabase,
} from './db-fixtures';
import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

const origin = process.env.PUBLIC_ORIGIN ?? 'http://127.0.0.1:4173';
const sharePath = (handle: string, postId: string) =>
  `/${encodeURIComponent(`@${handle}`).replace(/%40/gi, '@')}/${encodeGlobalId('Post', postId)}`;

async function readMetadata(page: Page, html: string) {
  return page.evaluate((source) => {
    const document = new DOMParser().parseFromString(source, 'text/html');
    const content = (selector: string) =>
      [...document.querySelectorAll<HTMLMetaElement>(selector)].map((meta) => meta.content);

    return {
      descriptions: content('meta[name="description"]'),
      ogDescriptions: content('meta[property="og:description"]'),
      ogImages: content('meta[property="og:image"]'),
      ogImageProperties: [
        ...document.querySelectorAll<HTMLMetaElement>('meta[property^="og:image"]'),
      ].map((meta) => [meta.getAttribute('property'), meta.content]),
      ogTitles: content('meta[property="og:title"]'),
      ogUrls: content('meta[property="og:url"]'),
      scriptText: [...document.scripts].map((script) => script.textContent ?? ''),
      title: document.title,
      twitterDescriptions: content('meta[name="twitter:description"]'),
      twitterImages: content('meta[name="twitter:image"]'),
      twitterTitles: content('meta[name="twitter:title"]'),
    };
  }, html);
}

test.beforeEach(async () => {
  await resetE2EDatabase();
});

test('공개 Quote의 현재 작성자·본문·Mention·이미지 순서로 초기 HTML을 구성하고 브라우저 상세 진입을 유지한다', async ({
  page,
  request,
}) => {
  const sourceOwner = await createE2ESession({
    displayName: 'E2E Hidden Quote Source',
    handle: 'e2e-hidden-quote-source',
  });
  const source = await createE2EPost({
    body: 'source-only preview secret',
    profileId: sourceOwner.profile!.id,
    visibility: PostVisibility.PUBLIC,
  });
  const author = await createE2ESession({
    displayName: '<img src=x onerror="preview()"> & Writer',
    handle: 'e2e-preview-author',
  });
  const mention = await createE2EProfile({ handle: 'e2e-preview-mention' });
  const mentionText = `@${mention.handle}`;
  const body = `한글과 이모지 👋 링크와 ${mentionText} <script>alert("preview")</script>`;
  const mentionStart = body.indexOf(mentionText);
  const quote = await createE2EPost({
    body,
    media: [
      {
        altText: '첫 "이미지" & <strong>대체 텍스트</strong>',
        url: 'https://media.example/first.png',
      },
      { mediaType: null, url: 'https://media.example/second.png' },
    ],
    mentions: [
      {
        end: mentionStart + mentionText.length,
        profileId: mention.id,
        relativeHandle: mentionText,
        start: mentionStart,
      },
    ],
    profileId: author.profile!.id,
    repostSourceId: source.id,
    visibility: PostVisibility.PUBLIC,
  });
  const path = `${sharePath('old-route-handle', quote.id)}?campaign=share`;
  const response = await request.get(path, {
    headers: { accept: 'text/html', 'user-agent': 'Slackbot 1.0' },
  });
  const html = await response.text();
  const metadata = await readMetadata(page, html);
  const canonicalUrl = `${origin}${sharePath(author.profile!.handle, quote.id)}`;

  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  expect(response.headers()['vary']).toBe('Accept');
  expect(response.headers()['etag']).toBeUndefined();
  expect(metadata.title).toBe(
    '<img src=x onerror="preview()"> & Writer (@e2e-preview-author) · KOSMO',
  );
  expect(metadata.descriptions).toEqual([body]);
  expect(metadata.ogDescriptions).toEqual([body]);
  expect(metadata.twitterDescriptions).toEqual([body]);
  expect(metadata.ogTitles).toEqual([metadata.title]);
  expect(metadata.twitterTitles).toEqual([metadata.title]);
  expect(metadata.ogUrls).toEqual([canonicalUrl]);
  expect(metadata.ogImages).toEqual([
    'https://media.example/first.png',
    'https://media.example/second.png',
  ]);
  expect(metadata.ogImageProperties).toEqual([
    ['og:image', 'https://media.example/first.png'],
    ['og:image:type', 'image/png'],
    ['og:image:alt', '첫 "이미지" & <strong>대체 텍스트</strong>'],
    ['og:image', 'https://media.example/second.png'],
  ]);
  expect(metadata.twitterImages).toEqual(['https://media.example/first.png']);
  expect(metadata.scriptText.some((text) => text.includes('alert("preview")'))).toBe(false);
  expect(html).not.toContain('source-only preview secret');
  expect(html).toContain('&lt;script&gt;alert(&quot;preview&quot;)&lt;/script&gt;');
  expect(html.match(/property="og:title"/g)).toHaveLength(1);

  const navigation = await page.goto(canonicalUrl);
  expect(navigation?.status()).toBe(200);
  await expect(page.getByText(body, { exact: true })).toBeVisible();
});

test('Content Warning과 Sensitive Media 원문·이미지 정보는 응답 어디에도 노출하지 않는다', async ({
  request,
}) => {
  const author = await createE2ESession({
    displayName: 'E2E Warning Author',
    handle: 'e2e-warning-author',
  });
  const warningBody = 'secret body behind a CW';
  const warningAlt = 'secret CW image alt';
  const warningUrl = 'https://media.example/secret-cw.png';
  const warning = await createE2EPost({
    body: warningBody,
    contentWarning: '민감한 경고 & 확인',
    media: [{ altText: warningAlt, url: warningUrl }],
    profileId: author.profile!.id,
    visibility: PostVisibility.PUBLIC,
  });
  const sensitiveBody = 'visible body with sensitive media';
  const sensitiveAlt = 'secret sensitive image alt';
  const sensitiveUrl = 'https://media.example/secret-sensitive.png';
  const sensitive = await createE2EPost({
    body: sensitiveBody,
    media: [{ altText: sensitiveAlt, url: sensitiveUrl }],
    profileId: author.profile!.id,
    sensitiveMedia: true,
    visibility: PostVisibility.PUBLIC,
  });

  const warningResponse = await request.get(sharePath(author.profile!.handle, warning.id));
  const warningHtml = await warningResponse.text();
  const sensitiveResponse = await request.get(sharePath(author.profile!.handle, sensitive.id));
  const sensitiveHtml = await sensitiveResponse.text();

  expect(warningHtml).toContain('콘텐츠 경고: 민감한 경고 &amp; 확인');
  expect(warningHtml).not.toContain(warningBody);
  expect(warningHtml).not.toContain(warningAlt);
  expect(warningHtml).not.toContain(warningUrl);
  expect(warningHtml).toContain(`${origin}/og-default.png`);
  expect(sensitiveHtml).toContain(sensitiveBody);
  expect(sensitiveHtml).not.toContain(sensitiveAlt);
  expect(sensitiveHtml).not.toContain(sensitiveUrl);
  expect(sensitiveHtml).toContain(`${origin}/og-default.png`);
});

test('순수 Repost는 guest가 볼 수 있는 직접 Source를 canonicalize하고 비공개 Post는 cookie와 UA로 공개하지 않는다', async ({
  request,
}) => {
  const sourceAuthor = await createE2ESession({
    displayName: 'E2E Direct Source Author',
    handle: 'e2e-direct-source-author',
  });
  const quoteSource = await createE2EPost({
    body: 'direct quote source body',
    profileId: sourceAuthor.profile!.id,
    visibility: PostVisibility.PUBLIC,
  });
  const repostAuthor = await createE2ESession({
    displayName: 'E2E Repost Author',
    handle: 'e2e-repost-author',
  });
  const repost = await createE2EPost({
    content: false,
    profileId: repostAuthor.profile!.id,
    repostSourceId: quoteSource.id,
    visibility: PostVisibility.PUBLIC,
  });
  const privatePost = await createE2EPost({
    body: 'followers only secret body',
    profileId: sourceAuthor.profile!.id,
    visibility: PostVisibility.FOLLOWERS,
  });
  const repostResponse = await request.get(sharePath(repostAuthor.profile!.handle, repost.id));
  const repostHtml = await repostResponse.text();
  const privateResponse = await request.get(
    sharePath(sourceAuthor.profile!.handle, privatePost.id),
    {
      headers: {
        cookie: `kosmo_session=${sourceAuthor.token}`,
        'user-agent': 'Twitterbot',
      },
    },
  );
  const privateHtml = await privateResponse.text();

  expect(repostHtml).toContain('direct quote source body');
  expect(repostHtml).toContain('E2E Direct Source Author (@e2e-direct-source-author) · KOSMO');
  expect(repostHtml).not.toContain('E2E Repost Author');
  expect(repostHtml).toContain(
    `${origin}${sharePath(sourceAuthor.profile!.handle, quoteSource.id)}`,
  );
  expect(privateResponse.status()).toBe(200);
  expect(privateHtml).not.toContain('followers only secret body');
  expect(privateHtml).not.toContain('E2E Direct Source Author');
  expect(privateHtml).toContain('흩어진 타임라인을 한곳에서.');

  const unlistedPost = await createE2EPost({
    body: 'unlisted direct share body',
    profileId: sourceAuthor.profile!.id,
    visibility: PostVisibility.UNLISTED,
  });
  const unlistedResponse = await request.get(
    sharePath(sourceAuthor.profile!.handle, unlistedPost.id),
  );
  expect(await unlistedResponse.text()).toContain('unlisted direct share body');

  const suspendedRemote = await createE2ERemoteProfile({
    displayName: 'E2E Suspended Remote Author',
    domain: 'suspended-preview.remote.example',
    handle: 'suspended-preview',
    instanceState: InstanceState.SUSPENDED,
  });
  const suspendedPost = await createE2EPost({
    body: 'suspended instance secret',
    profileId: suspendedRemote.id,
    visibility: PostVisibility.PUBLIC,
  });
  const suspendedResponse = await request.get(
    sharePath(`${suspendedRemote.handle}@suspended-preview.remote.example`, suspendedPost.id),
  );
  const suspendedHtml = await suspendedResponse.text();
  expect(suspendedHtml).not.toContain('suspended instance secret');
  expect(suspendedHtml).not.toContain('E2E Suspended Remote Author');
});

test('Reply는 Parent 대신 자체 Content를 표시하고 Remote 작성자의 표시용 Domain을 보존한다', async ({
  request,
}) => {
  const parentAuthor = await createE2ESession({
    displayName: 'E2E Reply Parent Author',
    handle: 'e2e-reply-parent',
  });
  const parent = await createE2EPost({
    body: 'reply parent only secret',
    profileId: parentAuthor.profile!.id,
    visibility: PostVisibility.PUBLIC,
  });
  const remoteAuthor = await createE2ERemoteProfile({
    displayName: 'E2E Remote Reply Author',
    domain: 'reply-preview.remote.example',
    handle: 'remote-reply',
  });
  const reply = await createE2EPost({
    body: 'remote reply body',
    profileId: remoteAuthor.id,
    replyParentId: parent.id,
    visibility: PostVisibility.PUBLIC,
  });
  const response = await request.get(
    sharePath(`${remoteAuthor.handle}@reply-preview.remote.example`, reply.id),
  );
  const html = await response.text();

  expect(html).toContain(
    'E2E Remote Reply Author (@remote-reply@reply-preview.remote.example) · KOSMO',
  );
  expect(html).toContain('remote reply body');
  expect(html).not.toContain('reply parent only secret');
});

test('실제 ActivityPub 경로는 HTML 미리보기와 분리해 공개·비공개 및 Accept 결과를 유지한다', async ({
  request,
}) => {
  const author = await createE2ESession({
    displayName: 'E2E Federation Author',
    handle: 'e2e-federation-author',
  });
  const publicPost = await createE2EPost({
    body: 'activitypub representation body',
    profileId: author.profile!.id,
    visibility: PostVisibility.PUBLIC,
  });
  const privatePost = await createE2EPost({
    body: 'private ActivityPub body',
    profileId: author.profile!.id,
    visibility: PostVisibility.FOLLOWERS,
  });
  const activityPath = (postId: string) => `/ap/note/${postId}`;
  const activityResponse = await request.get(activityPath(publicPost.id), {
    headers: { accept: 'application/activity+json' },
  });
  const htmlWithRejectedActivityPub = await request.get(
    sharePath(author.profile!.handle, publicPost.id),
    { headers: { accept: 'text/html, application/activity+json;q=0' } },
  );
  const activityBody = await activityResponse.text();
  const unavailableRepresentation = await request.get(activityPath(publicPost.id), {
    headers: { accept: 'text/html' },
  });
  const privateResponse = await request.get(activityPath(privatePost.id), {
    headers: { accept: 'application/activity+json' },
  });

  expect(activityResponse.status()).toBe(200);
  expect(activityResponse.headers()['content-type']).toContain('application/activity+json');
  expect(activityBody).toContain('activitypub representation body');
  expect(htmlWithRejectedActivityPub.status()).toBe(200);
  expect(await htmlWithRejectedActivityPub.text()).toContain('activitypub representation body');
  for (const accept of [
    'text/html;q=0.8, application/activity+json;q=0.5',
    'text/html, application/activity+json',
  ]) {
    const response = await request.get(sharePath(author.profile!.handle, publicPost.id), {
      headers: { accept },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    expect(await response.text()).toContain('activitypub representation body');
  }
  expect(unavailableRepresentation.status()).toBe(406);
  expect(unavailableRepresentation.headers()['vary']).toContain('Accept');
  expect(await unavailableRepresentation.text()).toBe('Not acceptable');
  expect(privateResponse.status()).toBe(404);
  expect(await privateResponse.text()).not.toContain('private ActivityPub body');
});

test('비공개 네트워크의 Remote 첨부 URL은 본문을 유지하고 기본 이미지로 대체한다', async ({
  page,
  request,
}) => {
  const author = await createE2ERemoteProfile({
    domain: 'image-preview.remote.example',
    handle: 'remote-image-preview',
  });
  for (const url of [
    'http://2130706433/private.png',
    'http://169.254.169.254/private.png',
    'http://[::ffff:127.0.0.1]/private.png',
    'http://sub.localhost./private.png',
  ]) {
    const post = await createE2EPost({
      body: 'public body with an unusable remote image',
      media: [{ url, altText: 'private network image alt' }],
      profileId: author.id,
      visibility: PostVisibility.PUBLIC,
    });
    const response = await request.get(
      sharePath(`${author.handle}@image-preview.remote.example`, post.id),
    );
    const html = await response.text();
    const metadata = await readMetadata(page, html);
    expect(response.status()).toBe(200);
    expect(metadata.ogDescriptions).toEqual(['public body with an unusable remote image']);
    expect(metadata.ogImages).toEqual([`${origin}/og-default.png`]);
    expect(metadata.twitterImages).toEqual([`${origin}/og-default.png`]);
    expect(html).not.toContain('private network image alt');
    expect(html).not.toContain(new URL(url).href);
  }
});

test('HEAD는 메타데이터 응답 헤더와 빈 본문을 반환하고 변경 후 이전 validator도 재사용하지 않는다', async ({
  request,
}) => {
  const author = await createE2ESession({
    displayName: 'E2E Revalidation Author',
    handle: 'e2e-revalidation-author',
  });
  const body = 'body removed before revalidation';
  const post = await createE2EPost({
    body,
    profileId: author.profile!.id,
    visibility: PostVisibility.PUBLIC,
  });
  const path = sharePath(author.profile!.handle, post.id);
  const initial = await request.get(path);
  const initialHtml = await initial.text();
  const etag = initial.headers()['etag'] ?? '"old-preview-validator"';

  await db.update(Posts).set({ state: PostState.DELETED }).where(eq(Posts.id, post.id));

  const revalidated = await request.get(path, { headers: { 'if-none-match': etag } });
  const revalidatedHtml = await revalidated.text();
  const head = await request.head(path);

  expect(initialHtml).toContain(body);
  expect(revalidated.status()).toBe(200);
  expect(revalidatedHtml).not.toContain(body);
  expect(revalidatedHtml).not.toContain('E2E Revalidation Author');
  expect(revalidatedHtml).toContain(`${origin}/og-default.png`);
  expect(head.status()).toBe(200);
  expect(head.headers()['content-type']).toContain('text/html');
  expect(head.headers()['cache-control']).toBe('no-store');
  expect(await head.text()).toBe('');
});
