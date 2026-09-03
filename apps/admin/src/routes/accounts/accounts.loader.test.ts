import { expect, test } from 'vitest';
import { load as loadAccounts } from './+page.server';

test.each([
  'http://admin.test/accounts?cursor=not-a-uuid',
  'http://admin.test/accounts?direction=previous',
])('rejects malformed pagination with a generic 404', async (url) => {
  await expect(
    loadAccounts({
      url: new URL(url),
    } as Parameters<typeof loadAccounts>[0]),
  ).rejects.toMatchObject({ status: 404, body: { message: 'Not Found' } });
});
