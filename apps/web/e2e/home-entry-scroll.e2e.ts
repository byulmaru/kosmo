import {
  createE2EFollow,
  createE2EPost,
  createE2EProfile,
  createE2ESession,
  resetE2EDatabase,
  setE2ESessionCookie,
} from './db-fixtures';
import { expect, test } from './fixtures';
import { toGlobalId } from './graphql';

for (const width of [390, 1440]) {
  for (const destination of [
    'post-body',
    'post-time',
    'profile-name',
    'profile-avatar',
    'profile-mention',
  ] as const) {
    test(`홈에서 ${destination}로 새로 진입하면 이전 스크롤을 넘기지 않는다 (${width}px)`, async ({
      context,
      page,
    }) => {
      test.setTimeout(90_000);
      await resetE2EDatabase();
      await page.setViewportSize({ width, height: 844 });
      const viewer = await createE2ESession({ handle: 'e2e-home-scroll-viewer' });
      const author = await createE2EProfile({
        displayName: 'E2E Home Scroll Author',
        handle: 'e2e-home-scroll-author',
      });
      await createE2EFollow({
        followerProfileId: viewer.profile!.id,
        followeeProfileId: author.id,
      });
      for (let index = 0; index < 6; index += 1) {
        await createE2EPost({
          body: `Profile older post ${index} ${'프로필 본문 '.repeat(50)}`,
          profileId: author.id,
        });
      }
      const mention = `@${author.handle}`;
      const body = `E2E Home navigation target${destination === 'profile-mention' ? ` ${mention}` : ''}`;
      const post = await createE2EPost({
        body,
        mentions:
          destination === 'profile-mention'
            ? [
                {
                  end: body.length,
                  handle: mention,
                  profileId: author.id,
                  relativeHandle: mention,
                  start: body.indexOf(mention),
                },
              ]
            : undefined,
        profileId: author.id,
      });
      for (let index = 0; index < 6; index += 1) {
        await createE2EPost({
          body: `Reply after target ${index} ${'답글 본문 '.repeat(30)}`,
          profileId: author.id,
          replyParentId: post.id,
        });
      }
      for (let index = 0; index < 8; index += 1) {
        await createE2EPost({
          body: `Home newer post ${index} ${'홈 본문 '.repeat(50)}`,
          profileId: viewer.profile!.id,
        });
      }
      await setE2ESessionCookie(context, viewer.token);
      await page.goto('/home');
      const card = page.getByRole('article').filter({ hasText: body });
      for (const entry of ['cold', 'cached']) {
        await test.step(entry, async () => {
          await card.scrollIntoViewIfNeeded();
          await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
          const homeOffset = await page.evaluate(() => window.scrollY);
          if (destination.startsWith('post-')) {
            if (destination === 'post-body') {
              await card.getByText(body, { exact: true }).click();
            } else {
              await card
                .locator(`a[href="/@${author.handle}/${toGlobalId('Post', post.id)}"]`)
                .click();
            }
            await expect(page).toHaveURL(`/@${author.handle}/${toGlobalId('Post', post.id)}`);
            await expect(
              page.getByTestId(`post-thread-current-${toGlobalId('Post', post.id)}`),
            ).toBeInViewport();
          } else {
            if (destination === 'profile-avatar') {
              await card.locator(`a[href="/@${author.handle}"]`).first().click();
            } else if (destination === 'profile-mention') {
              await card
                .getByRole('link', {
                  name: `${mention}, ${author.displayName}, 프로필 보기`,
                  exact: true,
                })
                .click();
            } else {
              await card
                .getByRole('link', {
                  name: 'E2E Home Scroll Author @e2e-home-scroll-author',
                  exact: true,
                })
                .click();
            }
            await expect(page).toHaveURL(`/@${author.handle}`);
            await expect(
              page.getByRole('heading', { name: 'E2E Home Scroll Author', exact: true }),
            ).toBeVisible();
          }
          await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(1);
          await page.goBack();
          await expect(page).toHaveURL('/home');
          await expect
            .poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - homeOffset))
            .toBeLessThanOrEqual(2);
          await expect(card).toBeInViewport();
        });
      }
    });
  }
}

for (const width of [390, 1440]) {
  for (const destination of [
    'quote-profile',
    'source-profile',
    'quote-body',
    'quote-time',
    'source-body',
    'source-time',
  ] as const) {
    test(`홈의 인용·원문 ${destination}로 새로 진입하면 이전 스크롤을 넘기지 않는다 (${width}px)`, async ({
      context,
      page,
    }) => {
      test.setTimeout(90_000);
      await resetE2EDatabase();
      await page.setViewportSize({ width, height: 844 });
      const viewer = await createE2ESession({ handle: 'e2e-quote-scroll-viewer' });
      const quoteAuthor = await createE2EProfile({
        displayName: 'E2E Quote Scroll Author',
        handle: 'e2e-quote-scroll-author',
      });
      const sourceAuthor = await createE2EProfile({
        displayName: 'E2E Source Scroll Author',
        handle: 'e2e-source-scroll-author',
      });
      await createE2EFollow({
        followerProfileId: viewer.profile!.id,
        followeeProfileId: quoteAuthor.id,
      });
      for (const author of [quoteAuthor, sourceAuthor]) {
        for (let index = 0; index < 6; index += 1) {
          await createE2EPost({
            body: `Older post ${author.handle} ${index} ${'프로필 본문 '.repeat(50)}`,
            profileId: author.id,
          });
        }
      }
      const sourceBody = 'E2E Home source navigation target';
      const source = await createE2EPost({ body: sourceBody, profileId: sourceAuthor.id });
      const quoteBody = 'E2E Home quote navigation target';
      const quote = await createE2EPost({
        body: quoteBody,
        profileId: quoteAuthor.id,
        repostSourceId: source.id,
      });
      for (let index = 0; index < 8; index += 1) {
        await createE2EPost({
          body: `Home newer post ${index} ${'홈 본문 '.repeat(50)}`,
          profileId: viewer.profile!.id,
        });
      }
      await setE2ESessionCookie(context, viewer.token);
      await page.goto('/home');
      const card = page.getByRole('article').filter({ hasText: quoteBody });
      const isSource = destination.startsWith('source-');
      const author = isSource ? sourceAuthor : quoteAuthor;
      const post = isSource ? source : quote;
      for (const entry of ['cold', 'cached']) {
        await test.step(entry, async () => {
          await card.scrollIntoViewIfNeeded();
          await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
          const homeOffset = await page.evaluate(() => window.scrollY);
          if (destination.endsWith('-profile')) {
            await card
              .getByRole('link', { name: `${author.displayName} 프로필 보기`, exact: true })
              .click();
            await expect(page).toHaveURL(`/@${author.handle}`);
            await expect(
              page.getByRole('heading', { name: author.displayName, exact: true }),
            ).toBeVisible();
          } else {
            if (destination.endsWith('-body')) {
              await card.getByText(isSource ? sourceBody : quoteBody, { exact: true }).click();
            } else {
              await card
                .getByRole('link', {
                  name: isSource ? '원문 게시글 보기' : `${author.displayName}의 게시글 보기`,
                  exact: true,
                })
                .click();
            }
            await expect(page).toHaveURL(`/@${author.handle}/${toGlobalId('Post', post.id)}`);
            await expect(
              page.getByTestId(`post-thread-current-${toGlobalId('Post', post.id)}`),
            ).toBeInViewport();
          }
          await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(1);
          await page.goBack();
          await expect(page).toHaveURL('/home');
          await expect
            .poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - homeOffset))
            .toBeLessThanOrEqual(2);
          await expect(card).toBeInViewport();
        });
      }
    });
  }
}
