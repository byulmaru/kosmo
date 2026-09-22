import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { db } from '@kosmo/core/db';
import { AccountProfileRole } from '@kosmo/core/enums';
import { encodeGlobalId } from '@kosmo/core/global-id';
import { applySelectedProfileExtension, deriveContext } from './context';
import type { Context, ServerContext } from './context';

const createRequestContext = async (): Promise<Context> => {
  return deriveContext({
    req: { header: () => undefined },
  } as unknown as ServerContext);
};

describe('GraphQL request context', () => {
  it('creates one request-scoped loader registry without a database handle', async () => {
    const context = await createRequestContext();

    assert.equal('db' in context, false);

    const loader = context.loader({
      name: 'request-context',
      load: async (keys: string[]) => keys.map((key) => ({ key })),
      key: (row) => row.key,
    });
    const loaderAgain = context.loader({
      name: 'request-context',
      load: async (keys: string[]) => keys.map((key) => ({ key })),
      key: (row) => row.key,
    });

    assert.equal(loader, loaderAgain);
    assert.equal(context.$loaders.size, 1);
  });

  it('overrides the request actor only for a valid member profile and uses its server role', async (t) => {
    const fallbackProfile = { id: 'fallback-profile', role: AccountProfileRole.OWNER };
    const selectedProfile = {
      id: '00000000-0000-8000-8000-000000000001',
      role: AccountProfileRole.MEMBER,
    };
    const chain = {
      from: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      limit: () => chain,
      then: (onFulfilled: (rows: unknown[]) => unknown) =>
        Promise.resolve([selectedProfile]).then(onFulfilled),
    };
    t.mock.method(db, 'select', () => chain as never);

    const context = {
      session: {
        id: 'session-id',
        accountId: 'account-id',
        profile: fallbackProfile,
      },
    } as unknown as Context;

    await applySelectedProfileExtension(context, {
      selectedProfileId: encodeGlobalId('Profile', selectedProfile.id),
      role: AccountProfileRole.OWNER,
    });

    assert.deepEqual(context.session?.profile, selectedProfile);
  });

  it('silently keeps the Sessions actor for malformed or unauthorized extensions', async (t) => {
    const fallbackProfile = { id: 'fallback-profile', role: AccountProfileRole.OWNER };
    const chain = {
      from: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      limit: () => chain,
      then: (onFulfilled: (rows: unknown[]) => unknown) => Promise.resolve([]).then(onFulfilled),
    };
    const select = t.mock.method(db, 'select', () => chain as never);
    const context = {
      session: {
        id: 'session-id',
        accountId: 'account-id',
        profile: fallbackProfile,
      },
    } as unknown as Context;

    await applySelectedProfileExtension(context, {
      selectedProfileId: 'malformed-profile-id',
    });
    assert.deepEqual(context.session?.profile, fallbackProfile);

    await applySelectedProfileExtension(context, {
      selectedProfileId: encodeGlobalId('Profile', '00000000-0000-8000-8000-000000000002'),
    });
    assert.deepEqual(context.session?.profile, fallbackProfile);

    await applySelectedProfileExtension(context, {
      selectedProfileId: encodeGlobalId('Post', '00000000-0000-8000-8000-000000000003'),
    });
    assert.deepEqual(context.session?.profile, fallbackProfile);
    assert.equal(select.mock.callCount(), 1);
  });
});
