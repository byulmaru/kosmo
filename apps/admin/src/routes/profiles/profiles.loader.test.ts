import { expect, test } from 'vitest';
import { load as loadProfiles } from './+page.server';

test.each([
  'http://admin.test/profiles?cursor=not-a-uuid',
  'http://admin.test/profiles?direction=previous',
  'http://admin.test/profiles?direction=next',
  'http://admin.test/profiles?origin=ACTIVITYPUB',
  'http://admin.test/profiles?state=DELETED',
])('rejects malformed Profile filters and pagination with a generic 404', async (url) => {
  await expect(
    loadProfiles({ url: new URL(url) } as Parameters<typeof loadProfiles>[0]),
  ).rejects.toMatchObject({ status: 404, body: { message: 'Not Found' } });
});
