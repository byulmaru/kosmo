import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { prepareFollowAcceptPayload } from '../scripts/prepare-follow-accept-payload';

const candidate = {
  reviewRequired: true,
  profileFollowId: '11111111-1111-4111-8111-111111111111',
  followerProfileId: '22222222-2222-4222-8222-222222222222',
  followeeProfileId: '33333333-3333-4333-8333-333333333333',
  sourceFollowId: 'https://remote.example/activities/follow-1',
  sourceFollowActorUri: 'https://remote.example/users/alice',
  sourceFollowObjectUri: 'https://local.example/ap/actor/33333333-3333-4333-8333-333333333333',
  remoteActorUri: 'https://remote.example/users/alice',
  remoteInboxUri: 'https://remote.example/users/alice/inbox',
  remoteSharedInboxUri: 'https://remote.example/inbox',
  localCanonicalOrigin: 'https://local.example',
};

describe('prepare-follow-accept-payload', () => {
  test('serializes the captured Accept for the exact Follow endpoints and requires review', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('Unexpected network request during payload preparation.');
    };

    let result: Awaited<ReturnType<typeof prepareFollowAcceptPayload>>;
    try {
      result = await prepareFollowAcceptPayload(candidate);
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(result.reviewRequired, true);
    assert.deepEqual(result.currentRelationship, {
      profileFollowId: candidate.profileFollowId,
      followerProfileId: candidate.followerProfileId,
      followeeProfileId: candidate.followeeProfileId,
    });
    assert.equal(result.accept.type, 'Accept');
    assert.equal(result.accept.actor, candidate.sourceFollowObjectUri);
    assert.deepEqual(result.accept.object, {
      id: candidate.sourceFollowId,
      type: 'Follow',
      actor: candidate.remoteActorUri,
      object: candidate.sourceFollowObjectUri,
    });
    assert.equal(result.accept.to, candidate.remoteActorUri);
    assert.deepEqual(result.sourceFollow, {
      id: candidate.sourceFollowId,
      actor: candidate.sourceFollowActorUri,
      object: candidate.sourceFollowObjectUri,
    });
    assert.equal(result.deliveryTarget.inbox, candidate.remoteInboxUri);
    assert.equal(result.deliveryTarget.sharedInbox, candidate.remoteSharedInboxUri);
  });

  test('omits an unknown Follow ID instead of inventing one', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('Unexpected network request during payload preparation.');
    };

    const idlessCandidate: Record<string, unknown> = { ...candidate };
    delete idlessCandidate.sourceFollowId;

    let result: Awaited<ReturnType<typeof prepareFollowAcceptPayload>>;
    try {
      result = await prepareFollowAcceptPayload(idlessCandidate);
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.deepEqual(result.accept.object, {
      type: 'Follow',
      actor: candidate.remoteActorUri,
      object: candidate.sourceFollowObjectUri,
    });
    assert.deepEqual(result.sourceFollow, {
      actor: candidate.sourceFollowActorUri,
      object: candidate.sourceFollowObjectUri,
    });
  });

  test('rejects an ActivityPub Follow whose actor differs from the stored remote actor', async () => {
    await assert.rejects(
      prepareFollowAcceptPayload({
        ...candidate,
        sourceFollowActorUri: 'https://other.example/users/alice',
      }),
      /Follow actor and object must match the delivery endpoints/,
    );
  });

  test('rejects a local target that does not identify the current followee', async () => {
    await assert.rejects(
      prepareFollowAcceptPayload({
        ...candidate,
        sourceFollowObjectUri:
          'https://local.example/ap/actor/33333333-3333-4333-8333-333333333334',
      }),
      /Follow actor and object must match the delivery endpoints/,
    );
  });

  test('rejects non-HTTP(S) endpoints and inputs without the review-required marker', async () => {
    await assert.rejects(
      prepareFollowAcceptPayload({ ...candidate, sourceFollowId: 'file:///tmp/follow.json' }),
      /review-required Follow schema/,
    );
    await assert.rejects(
      prepareFollowAcceptPayload({ ...candidate, reviewRequired: false }),
      /review-required Follow schema/,
    );
  });
});
