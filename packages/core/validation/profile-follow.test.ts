import assert from 'node:assert/strict';
import test from 'node:test';
import {
  profileFollowPairCommandSchema,
  profileFollowPairSchema,
  profileFollowRemovalInputSchema,
} from './profile-follow';

const pair = {
  followerProfileId: 'follower',
  followeeProfileId: 'followee',
};

test('Profile Follow schemas accept every supported command variant', () => {
  for (const command of [
    { kind: 'FOLLOW', origin: 'LOCAL' },
    { kind: 'FOLLOW', origin: 'ACTIVITYPUB' },
    { kind: 'APPROVE', actorProfileId: 'followee', expectedRowId: 'request', origin: 'LOCAL' },
    { kind: 'ACCEPT', expectedRowId: 'request', origin: 'ACTIVITYPUB' },
    {
      kind: 'REJECT',
      actorProfileId: 'followee',
      expectedRowId: 'request',
      origin: 'LOCAL',
    },
    { kind: 'REJECT', expectedRowId: 'request', origin: 'ACTIVITYPUB' },
    { kind: 'REJECT', actorProfileId: 'remote', expectedRowId: 'request', origin: 'ACTIVITYPUB' },
    { kind: 'CANCEL', actorProfileId: 'follower', expectedRowId: 'request', origin: 'LOCAL' },
    { kind: 'CANCEL', expectedRowId: 'request', origin: 'ACTIVITYPUB' },
  ]) {
    assert.equal(profileFollowPairCommandSchema.safeParse(command).success, true);
  }

  assert.equal(profileFollowPairSchema.safeParse(pair).success, true);
  assert.equal(
    profileFollowRemovalInputSchema.safeParse({
      ...pair,
      expectedRowId: 'follow',
      origin: 'LOCAL',
    }).success,
    true,
  );
});

test('Profile Follow schemas reject invalid variants and extra wire fields', () => {
  for (const command of [
    {
      kind: 'APPROVE',
      actorProfileId: 'followee',
      expectedRowId: 'request',
      origin: 'ACTIVITYPUB',
    },
    { kind: 'ACCEPT', expectedRowId: 'request', origin: 'LOCAL' },
    { kind: 'REJECT', expectedRowId: 'request', origin: 'LOCAL' },
    { kind: 'CANCEL', actorProfileId: '', expectedRowId: 'request', origin: 'ACTIVITYPUB' },
    { kind: 'FOLLOW', origin: 'LOCAL', command: { kind: 'FOLLOW', origin: 'LOCAL' } },
    { kind: 'FOLLOW', origin: 'LOCAL', extra: true },
    { command: { kind: 'FOLLOW', origin: 'LOCAL' } },
  ]) {
    assert.equal(profileFollowPairCommandSchema.safeParse(command).success, false);
  }

  assert.equal(profileFollowPairSchema.safeParse({ ...pair, extra: true }).success, false);
  assert.equal(
    profileFollowRemovalInputSchema.safeParse({
      ...pair,
      expectedRowId: 'follow',
      origin: 'LOCAL',
      extra: true,
    }).success,
    false,
  );
});
