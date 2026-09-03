import { expect, test } from 'vitest';
import { load as loadAccount } from './+page.server';

test('rejects a malformed account ID with a generic 404', async () => {
  await expect(
    loadAccount({ params: { id: 'not-a-uuid' } } as Parameters<typeof loadAccount>[0]),
  ).rejects.toMatchObject({ status: 404, body: { message: 'Not Found' } });
});
