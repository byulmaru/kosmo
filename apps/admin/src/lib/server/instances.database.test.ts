import '@kosmo/core/polyfill';

import { db, Instances, pg, Profiles, withPrimaryDatabase } from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } from '@kosmo/core/enums';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  actions as instanceActions,
  load as loadInstances,
} from '../../routes/instances/+page.server';
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

const loadInstancePage = async (url: URL, method = 'GET') => {
  const page = await loadInstances({
    url,
    request: new Request(url, { method }),
  } as Parameters<typeof loadInstances>[0]);
  if (!page) {
    throw new Error('Expected Instance list data');
  }
  return page as {
    instances: InstanceListRow[];
    previousCursor: string | null;
    nextCursor: string | null;
    filters: { q: string; state: string; cursor: string; direction: string };
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
        suspensionReason: index === instanceIds.length - 1 ? 'Upstream check failed' : null,
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
      moderationAction: 'SUSPEND',
      profileCount: 1,
      suspensionReason: null,
    });
    expect(firstPage.previousCursor).toBeNull();
    expect(firstPage.nextCursor).toBeTruthy();
    expect(
      firstPage.instances.find(({ id }) => id === instanceIds[1])?.moderationAction,
    ).toBeNull();

    const nextUrl = new URL('http://admin.test/instances');
    nextUrl.searchParams.set('q', token);
    nextUrl.searchParams.set('state', 'ACTIVE');
    nextUrl.searchParams.set('cursor', firstPage.nextCursor!);
    const nextPage = await loadInstancePage(nextUrl);
    expect(nextPage.filters.cursor).toBe(firstPage.nextCursor);

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
    expect(previousPage.filters.direction).toBe('previous');

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
        moderationAction: 'SUSPEND',
        profileCount: 0,
        suspensionReason: null,
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
      loadInstances({
        url: new URL(url),
        request: new Request(url),
      } as Parameters<typeof loadInstances>[0]),
    ).rejects.toMatchObject({ status: 404, body: { message: 'Not Found' } });
  });

  test('shows the suspension reason for a suspended Instance', async () => {
    const page = await loadInstancePage(
      new URL(`http://admin.test/instances?q=${encodeURIComponent(domainFor(52))}`),
    );

    expect(page.instances).toMatchObject([
      {
        id: instanceIds[52],
        state: InstanceState.SUSPENDED,
        moderationAction: 'RESTORE',
        suspensionReason: 'Upstream check failed',
      },
    ]);
  });

  test('suspends and restores remote Instances, restoring unresponsive ones to ACTIVE', async () => {
    const callAction = async (action: 'suspend' | 'restore', id: string, reason?: string) => {
      const formData = new FormData();
      formData.set('id', id);
      if (reason !== undefined) {
        formData.set('reason', reason);
      }
      const request = new Request(`http://admin.test/instances?/${action}`, {
        method: 'POST',
        body: formData,
      });
      const event = { request } as Parameters<typeof instanceActions.suspend>[0];
      return action === 'suspend' ? instanceActions.suspend(event) : instanceActions.restore(event);
    };
    const readInstance = (id: string) =>
      withPrimaryDatabase(() =>
        db
          .select({ state: Instances.state, suspensionReason: Instances.suspensionReason })
          .from(Instances)
          .where(eq(Instances.id, id))
          .limit(1)
          .then((rows) => rows[0]),
      );

    expect(await callAction('restore', instanceIds[52])).toEqual({
      moderationSuccess: 'restored',
    });
    expect(await readInstance(instanceIds[52])).toEqual({
      state: InstanceState.ACTIVE,
      suspensionReason: null,
    });

    const activePage = await loadInstancePage(
      new URL(`http://admin.test/instances?q=${encodeURIComponent(domainFor(52))}`),
      'POST',
    );
    expect(activePage.instances).toMatchObject([
      { id: instanceIds[52], state: InstanceState.ACTIVE, moderationAction: 'SUSPEND' },
    ]);

    expect(await callAction('suspend', instanceIds[52], '  connection failure  ')).toEqual({
      moderationSuccess: 'suspended',
    });
    expect(await readInstance(instanceIds[52])).toEqual({
      state: InstanceState.SUSPENDED,
      suspensionReason: 'connection failure',
    });
    expect(await callAction('restore', instanceIds[52])).toEqual({
      moderationSuccess: 'restored',
    });
    expect(await readInstance(instanceIds[52])).toEqual({
      state: InstanceState.ACTIVE,
      suspensionReason: null,
    });

    expect(await callAction('suspend', instanceIds[51], '   ')).toEqual({
      moderationSuccess: 'suspended',
    });
    expect(await readInstance(instanceIds[51])).toEqual({
      state: InstanceState.SUSPENDED,
      suspensionReason: null,
    });
    expect(await callAction('restore', instanceIds[51])).toEqual({
      moderationSuccess: 'restored',
    });
    expect(await readInstance(instanceIds[51])).toEqual({
      state: InstanceState.ACTIVE,
      suspensionReason: null,
    });
  });

  test('does not suspend or restore a LOCAL Instance', async () => {
    const callAction = async (action: 'suspend' | 'restore', id: string, reason?: string) => {
      const formData = new FormData();
      formData.set('id', id);
      if (reason !== undefined) {
        formData.set('reason', reason);
      }
      const request = new Request(`http://admin.test/instances?/${action}`, {
        method: 'POST',
        body: formData,
      });
      const event = { request } as Parameters<typeof instanceActions.suspend>[0];
      return action === 'suspend' ? instanceActions.suspend(event) : instanceActions.restore(event);
    };
    const readLocalInstance = () =>
      withPrimaryDatabase(() =>
        db
          .select({ state: Instances.state, suspensionReason: Instances.suspensionReason })
          .from(Instances)
          .where(eq(Instances.id, instanceIds[1]))
          .limit(1)
          .then((rows) => rows[0]),
      );

    const suspended = await callAction('suspend', instanceIds[1], 'local instances are excluded');
    expect(suspended).toMatchObject({
      status: 409,
      data: { moderationError: 'Instance state changed. Refresh and try again.' },
    });
    expect(await readLocalInstance()).toEqual({
      state: InstanceState.ACTIVE,
      suspensionReason: null,
    });

    await db
      .update(Instances)
      .set({ state: InstanceState.SUSPENDED, suspensionReason: 'Retained local reason' })
      .where(eq(Instances.id, instanceIds[1]));
    const restored = await callAction('restore', instanceIds[1]);
    expect(restored).toMatchObject({
      status: 409,
      data: { moderationError: 'Instance state changed. Refresh and try again.' },
    });
    expect(await readLocalInstance()).toEqual({
      state: InstanceState.SUSPENDED,
      suspensionReason: 'Retained local reason',
    });
  });
});
