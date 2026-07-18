import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import {
  db,
  firstOrThrow,
  Instances,
  pg,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '../db';
import { InstanceKind, InstanceState, ProfileFollowPolicy } from '../enums';
import { removeInboundFollow } from './inbound-profile-follow';
import {
  acceptOutboundProfileFollow,
  findOutboundProfileFollowProjectionById,
  findOutboundProfileFollowProjectionByPair,
} from './outbound-profile-follow';

after(async () => pg.end());

describe('outbound profile follow projection', () => {
  test('promotes a pending request once and increments counts once', async () => {
    const fixture = await createFixture();
    const projection = await findOutboundProfileFollowProjectionById(fixture.request.id);
    assert.deepEqual(projection, fixture.request);

    const input = {
      expectedRowId: fixture.request.id,
      followeeProfileId: fixture.remoteProfile.id,
      followerProfileId: fixture.localProfile.id,
    };
    const results = await Promise.all([
      acceptOutboundProfileFollow(input),
      acceptOutboundProfileFollow(input),
    ]);

    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(await countPairRows(ProfileFollowRequests, fixture), 0);
    assert.equal(await countPairRows(ProfileFollows, fixture), 1);
    assert.deepEqual(await readCounts(fixture), { localFollowing: 1, remoteFollowers: 1 });
  });

  test('lets only one exact-row Accept or Reject transition win', async () => {
    const fixture = await createFixture();
    const input = {
      expectedRowId: fixture.request.id,
      followeeProfileId: fixture.remoteProfile.id,
      followerProfileId: fixture.localProfile.id,
    };
    const results = await Promise.all([
      acceptOutboundProfileFollow(input),
      removeInboundFollow(input),
    ]);

    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(await countPairRows(ProfileFollowRequests, fixture), 0);
    const relationCount = await countPairRows(ProfileFollows, fixture);
    assert.deepEqual(await readCounts(fixture), {
      localFollowing: relationCount,
      remoteFollowers: relationCount,
    });
  });

  test('does not apply an old request id to a replacement request', async () => {
    const fixture = await createFixture();
    await db.delete(ProfileFollowRequests).where(eq(ProfileFollowRequests.id, fixture.request.id));
    const replacement = await db
      .insert(ProfileFollowRequests)
      .values({
        followeeProfileId: fixture.remoteProfile.id,
        followerProfileId: fixture.localProfile.id,
      })
      .returning()
      .then(firstOrThrow);
    const staleInput = {
      expectedRowId: fixture.request.id,
      followeeProfileId: fixture.remoteProfile.id,
      followerProfileId: fixture.localProfile.id,
    };

    assert.equal(await acceptOutboundProfileFollow(staleInput), false);
    assert.equal(await removeInboundFollow(staleInput), false);
    assert.deepEqual(
      await findOutboundProfileFollowProjectionByPair({
        followeeProfileId: fixture.remoteProfile.id,
        followerProfileId: fixture.localProfile.id,
      }),
      replacement,
    );
  });
});

const createFixture = async () => {
  const suffix = crypto.randomUUID();
  const [localInstance, remoteInstance] = await db
    .insert(Instances)
    .values([
      {
        domain: `local-${suffix}.example`,
        kind: InstanceKind.LOCAL,
        state: InstanceState.ACTIVE,
      },
      {
        domain: `remote-${suffix}.example`,
        kind: InstanceKind.ACTIVITYPUB,
        state: InstanceState.ACTIVE,
      },
    ])
    .returning();
  const [localProfile, remoteProfile] = await db
    .insert(Profiles)
    .values([
      {
        displayName: 'Local',
        followPolicy: ProfileFollowPolicy.OPEN,
        handle: `local-${suffix}`,
        instanceId: localInstance!.id,
        normalizedHandle: `local-${suffix}`,
      },
      {
        displayName: 'Remote',
        followPolicy: ProfileFollowPolicy.APPROVAL_REQUIRED,
        handle: `remote-${suffix}`,
        instanceId: remoteInstance!.id,
        normalizedHandle: `remote-${suffix}`,
      },
    ])
    .returning();
  const request = await db
    .insert(ProfileFollowRequests)
    .values({
      followeeProfileId: remoteProfile!.id,
      followerProfileId: localProfile!.id,
    })
    .returning()
    .then(firstOrThrow);

  return {
    localProfile: localProfile!,
    remoteProfile: remoteProfile!,
    request,
  };
};

const readCounts = async ({
  localProfile,
  remoteProfile,
}: {
  readonly localProfile: { readonly id: string };
  readonly remoteProfile: { readonly id: string };
}) => ({
  localFollowing: await db
    .select({ count: Profiles.followingCount })
    .from(Profiles)
    .where(eq(Profiles.id, localProfile.id))
    .then(firstOrThrow)
    .then(({ count }) => count),
  remoteFollowers: await db
    .select({ count: Profiles.followersCount })
    .from(Profiles)
    .where(eq(Profiles.id, remoteProfile.id))
    .then(firstOrThrow)
    .then(({ count }) => count),
});

const countPairRows = async (
  table: typeof ProfileFollows | typeof ProfileFollowRequests,
  {
    localProfile,
    remoteProfile,
  }: {
    readonly localProfile: { readonly id: string };
    readonly remoteProfile: { readonly id: string };
  },
) =>
  db
    .select()
    .from(table)
    .where(
      and(
        eq(table.followerProfileId, localProfile.id),
        eq(table.followeeProfileId, remoteProfile.id),
      ),
    )
    .then((rows) => rows.length);
