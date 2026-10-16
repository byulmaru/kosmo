import { expect, test } from 'vitest';
import { load as loadProfilePosts } from './+page.server';

test.each([
  { id: 'not-a-uuid', url: 'http://admin.test/profiles/not-a-uuid/posts' },
  {
    id: '00000000-0000-7000-8000-000000000000',
    url: 'http://admin.test/profiles/00000000-0000-7000-8000-000000000000/posts?cursor=bad',
  },
  {
    id: '00000000-0000-7000-8000-000000000000',
    url: 'http://admin.test/profiles/00000000-0000-7000-8000-000000000000/posts?direction=previous',
  },
  {
    id: '00000000-0000-7000-8000-000000000000',
    url: 'http://admin.test/profiles/00000000-0000-7000-8000-000000000000/posts?direction=next',
  },
])('rejects malformed Profile Posts route parameters with a generic 404', async ({ id, url }) => {
  await expect(
    loadProfilePosts({ params: { id }, url: new URL(url) } as Parameters<
      typeof loadProfilePosts
    >[0]),
  ).rejects.toMatchObject({ status: 404, body: { message: 'Not Found' } });
});
