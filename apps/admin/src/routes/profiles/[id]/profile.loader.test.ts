import { expect, test } from 'vitest';
import { load as loadProfile } from './+page.server';

test('rejects a malformed Profile ID with a generic 404', async () => {
  await expect(
    loadProfile({ params: { id: 'not-a-uuid' } } as Parameters<typeof loadProfile>[0]),
  ).rejects.toMatchObject({ status: 404, body: { message: 'Not Found' } });
});
