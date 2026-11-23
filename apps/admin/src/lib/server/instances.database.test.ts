import '@kosmo/core/polyfill';

import { db, Instances, pg, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } from '@kosmo/core/enums';
import { inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { load as loadInstances } from '../../routes/instances/+page.server';
import { load as loadProfiles } from '../../routes/profiles/+page.server';
import type { InstanceListRow } from './instances';
import type { ProfileListRow } from './profiles';

const token = 'prod-1352-instances';
const instanceIds = Array.from(
  { length: 53 },
  (_, index) => `aaaaaaaa-aaaa-7000-8000-${String(index + 1).padStart(12, '0')}`,
);
const profileIds = Array.from(
  { length: 51 },
  (_, index) => `bbbbbbbb-bbbb-7000-8000-${String(index + 1).padStart(12, '0')}`,
);
const domainFor = (index: number) =>
  `instance-${token}-${String(index + 1).padStart(2, '0')}.example`;

const loadInstancePage = async (url: URL) => {
  const page = await loadInstances({ url } as Parameters<typeof loadInstances>[0]);
  if (!page) {
    throw new Error('Expected Instance list data');
  }
  return page as {
    instances: InstanceListRow[];
    previousCursor: string | null;
    nextCursor: string | null;
    filters: { q: string; state: string };
  };
};

const loadProfilePage = async (url: URL) => {
  const page = await loadProfiles({ url } as Parameters<typeof loadProfiles>[0]);
  if (!page) {
    throw new Error('Expected Profile list data');
  }
  return page as {
    profiles: ProfileListRow[];
    filters: { instanceDomain?: string };
  };
};

describe('Admin Instance read projections', () => {
  beforeAll(async () => {
    await db.insert(Instances).values(
      instanceIds.map((id, index) => ({
        id,
        domain: domainFor(index),
        kind: index === 1 ? InstanceKind.LOCAL : InstanceKind.ACTIVITYPUB,
        state:
          index < profileIds.length
            ? InstanceState.ACTIVE
            : index === instanceIds.length - 1
              ? InstanceState.SUSPENDED
              : InstanceState.UNRESPONSIVE,
      })),
    );

    await db.insert(Profiles).values(
      profileIds.map((id, index) => ({
        id,
        instanceId: instanceIds[index]!,
        state:
          index === 0
            ? ProfileState.SUSPENDED
            : index === 1
              ? ProfileState.DISABLED
              : ProfileState.ACTIVE,
        handle: `profile-${index + 1}`,
        normalizedHandle: `profile-${index + 1}`,
        displayName: `Profile ${index + 1}`,
        followPolicy: ProfileFollowPolicy.OPEN,
      })),
    );
  });

  afterAll(async () => {
    await db.delete(Profiles).where(inArray(Profiles.id, profileIds));
    await db.delete(Instances).where(inArray(Instances.id, instanceIds));
    await pg.end();
  });

  test('includes zero-profile instances and uses profile count then ID across both pages', async () => {
    const firstPage = await loadInstancePage(
      new URL(`http://admin.test/instances?q=${token.toUpperCase()}&state=ACTIVE`),
    );

    expect(firstPage.instances).toHaveLength(50);
    expect(firstPage.instances.map(({ id }) => id)).toEqual(instanceIds.slice(1, 51).reverse());
    expect(firstPage.instances[0]).toEqual({
      id: instanceIds[50],
      domain: domainFor(50),
      state: InstanceState.ACTIVE,
      profileCount: 1,
    });
    expect(firstPage.previousCursor).toBeNull();
    expect(firstPage.nextCursor).toBeTruthy();

    const nextUrl = new URL('http://admin.test/instances');
    nextUrl.searchParams.set('q', token);
    nextUrl.searchParams.set('state', 'ACTIVE');
    nextUrl.searchParams.set('cursor', firstPage.nextCursor!);
    const nextPage = await loadInstancePage(nextUrl);

    expect(nextPage.instances.map(({ id, profileCount }) => [id, profileCount])).toEqual([
      [instanceIds[0], 1],
    ]);
    expect(nextPage.previousCursor).toBeTruthy();
    expect(nextPage.nextCursor).toBeNull();

    const previousUrl = new URL('http://admin.test/instances');
    previousUrl.searchParams.set('q', token);
    previousUrl.searchParams.set('state', 'ACTIVE');
    previousUrl.searchParams.set('cursor', nextPage.previousCursor!);
    previousUrl.searchParams.set('direction', 'previous');
    const previousPage = await loadInstancePage(previousUrl);

    expect(previousPage.instances.map(({ id }) => id)).toEqual(instanceIds.slice(1, 51).reverse());
    expect(previousPage.nextCursor).toBeTruthy();
    expect(previousPage.previousCursor).toBeNull();

    const returnUrl = new URL('http://admin.test/instances');
    returnUrl.searchParams.set('q', token);
    returnUrl.searchParams.set('state', 'ACTIVE');
    returnUrl.searchParams.set('cursor', previousPage.nextCursor!);
    const returnPage = await loadInstancePage(returnUrl);

    expect(returnPage.instances.map(({ id }) => id)).toEqual([instanceIds[0]]);
    expect(returnPage.previousCursor).toBeTruthy();

    const allInstances = await loadInstancePage(new URL(`http://admin.test/instances?q=${token}`));
    const finalUrl = new URL('http://admin.test/instances');
    finalUrl.searchParams.set('q', token);
    finalUrl.searchParams.set('cursor', allInstances.nextCursor!);
    const finalPage = await loadInstancePage(finalUrl);

    expect(
      finalPage.instances.map(({ id, profileCount, state }) => [id, profileCount, state]),
    ).toEqual([
      [instanceIds[0], 1, InstanceState.ACTIVE],
      [instanceIds[52], 0, InstanceState.SUSPENDED],
      [instanceIds[51], 0, InstanceState.UNRESPONSIVE],
    ]);
  });

  test('combines case-insensitive domain search with an exact stored-state filter', async () => {
    const page = await loadInstancePage(
      new URL(
        `http://admin.test/instances?q=${encodeURIComponent(`${token.toUpperCase()}-52.EXAMPLE`)}&state=UNRESPONSIVE`,
      ),
    );

    expect(page.instances).toEqual([
      {
        id: instanceIds[51],
        domain: domainFor(51),
        state: InstanceState.UNRESPONSIVE,
        profileCount: 0,
      },
    ]);

    const mismatchedState = await loadInstancePage(
      new URL(
        `http://admin.test/instances?q=${encodeURIComponent(`${token.toUpperCase()}-52.EXAMPLE`)}&state=ACTIVE`,
      ),
    );
    expect(mismatchedState.instances).toEqual([]);
  });

  test('filters Profiles by exact Instance domain and keeps inactive Profiles in the scope', async () => {
    const url = new URL('http://admin.test/profiles');
    url.searchParams.set('instanceDomain', ` ${domainFor(0).toUpperCase()} `);
    const page = await loadProfilePage(url);

    expect(page.filters.instanceDomain).toBe(domainFor(0));
    expect(page.profiles.map(({ id, state }) => [id, state])).toEqual([
      [profileIds[0], ProfileState.SUSPENDED],
    ]);

    url.searchParams.set('state', 'ACTIVE');
    expect((await loadProfilePage(url)).profiles).toEqual([]);

    url.searchParams.delete('state');
    url.searchParams.set('instanceDomain', domainFor(0).replace('.example', ''));
    expect((await loadProfilePage(url)).profiles).toEqual([]);
  });

  test.each([
    'http://admin.test/instances?state=UNKNOWN',
    'http://admin.test/instances?cursor=not-a-cursor',
    'http://admin.test/instances?direction=previous',
  ])('rejects invalid Instance filters and cursors', async (url) => {
    await expect(
      loadInstances({ url: new URL(url) } as Parameters<typeof loadInstances>[0]),
    ).rejects.toMatchObject({ status: 404, body: { message: 'Not Found' } });
  });
});
