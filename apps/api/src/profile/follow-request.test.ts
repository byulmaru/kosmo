import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import test from 'node:test';
import { ProfileFollowPolicy, ProfileState } from '@kosmo/core/enums';
import { NotFoundError } from '@kosmo/core/error';
import { FollowRequestService } from '@kosmo/core/follow-request';
import type { ProfileFollowPolicy as ProfileFollowPolicyValue } from '@kosmo/core/enums';
import type {
  ActivityPubFollowPort,
  FollowRequestNotificationPort,
  FollowRequestProfile,
  FollowRequestRepository,
  FollowRequestRow,
  FollowRequestStore,
  FollowRow,
} from '@kosmo/core/follow-request';

const now = () => Temporal.Now.instant();

class MemoryFollowRequestRepository implements FollowRequestRepository, FollowRequestStore {
  readonly profiles = new Map<string, FollowRequestProfile>();
  readonly follows = new Map<string, FollowRow>();
  readonly requests = new Map<string, FollowRequestRow>();
  #sequence = 0;

  addProfile(
    id: string,
    followPolicy: ProfileFollowPolicyValue = ProfileFollowPolicy.APPROVAL_REQUIRED,
  ) {
    this.profiles.set(id, { id, state: ProfileState.ACTIVE, followPolicy });
  }

  transaction<T>(callback: (store: FollowRequestStore) => Promise<T>) {
    return callback(this);
  }

  async lockPair() {}
  async findProfile(id: string) {
    return this.profiles.get(id);
  }
  async findFollow(followerProfileId: string, followeeProfileId: string) {
    return this.follows.get(`${followerProfileId}:${followeeProfileId}`);
  }
  async findRequest(followerProfileId: string, followeeProfileId: string) {
    return [...this.requests.values()].find(
      (request) =>
        request.followerProfileId === followerProfileId &&
        request.followeeProfileId === followeeProfileId,
    );
  }
  async findRequestById(id: string) {
    return this.requests.get(id);
  }
  async insertFollow(followerProfileId: string, followeeProfileId: string) {
    const follow = {
      id: `follow-${++this.#sequence}`,
      followerProfileId,
      followeeProfileId,
      createdAt: now(),
    };
    this.follows.set(`${followerProfileId}:${followeeProfileId}`, follow);
    return follow;
  }
  async insertRequest(followerProfileId: string, followeeProfileId: string) {
    const request = {
      id: `request-${++this.#sequence}`,
      followerProfileId,
      followeeProfileId,
      createdAt: now(),
    };
    this.requests.set(request.id, request);
    return request;
  }
  async deleteRequest(id: string) {
    const request = this.requests.get(id);
    this.requests.delete(id);
    return request;
  }
}

const createFixture = () => {
  const repository = new MemoryFollowRequestRepository();
  repository.addProfile('follower');
  repository.addProfile('followee');

  const notificationEvents: string[] = [];
  const activityEvents: string[] = [];
  const notifications: FollowRequestNotificationPort = {
    created: async ({ request }) => void notificationEvents.push(`created:${request.id}`),
    removed: async ({ request, reason }) =>
      void notificationEvents.push(`removed:${request.id}:${reason}`),
  };
  const activityPub: ActivityPubFollowPort = {
    requestCreated: async ({ request }) => void activityEvents.push(`created:${request.id}`),
    respond: async ({ request, disposition }) =>
      void activityEvents.push(`respond:${request.id}:${disposition}`),
  };
  const service = new FollowRequestService({ repository, notifications, activityPub });

  return { repository, service, notificationEvents, activityEvents };
};

test('creates one pending-only request and reuses it idempotently', async () => {
  const { repository, service, notificationEvents } = createFixture();

  const first = await service.followProfile({
    followerProfileId: 'follower',
    followeeProfileId: 'followee',
  });
  const second = await service.followProfile({
    followerProfileId: 'follower',
    followeeProfileId: 'followee',
  });

  assert.equal(first.kind, 'request');
  assert.equal(second.kind, 'request');
  assert.equal(repository.requests.size, 1);
  assert.deepEqual(notificationEvents, [
    `created:${first.kind === 'request' ? first.request.id : ''}`,
  ]);
});

test('approves by deleting the request and creating one established follow', async () => {
  const { repository, service, notificationEvents, activityEvents } = createFixture();
  const pending = await service.followProfile({
    followerProfileId: 'follower',
    followeeProfileId: 'followee',
  });
  assert.equal(pending.kind, 'request');
  if (pending.kind !== 'request') {
    return;
  }

  const result = await service.approve({
    requestId: pending.request.id,
    actorProfileId: 'followee',
  });

  assert.equal(repository.requests.size, 0);
  assert.equal(repository.follows.size, 1);
  assert.equal(result.follow.followerProfileId, 'follower');
  assert.deepEqual(notificationEvents, [
    `created:${pending.request.id}`,
    `removed:${pending.request.id}:accepted`,
  ]);
  assert.deepEqual(activityEvents, [`respond:${pending.request.id}:accepted`]);
});

test('rejects and cancels without creating a follow and enforces participant roles', async () => {
  const rejectedFixture = createFixture();
  const rejected = await rejectedFixture.service.followProfile({
    followerProfileId: 'follower',
    followeeProfileId: 'followee',
  });
  assert.equal(rejected.kind, 'request');
  if (rejected.kind !== 'request') {
    return;
  }

  await assert.rejects(
    rejectedFixture.service.reject({
      requestId: rejected.request.id,
      actorProfileId: 'follower',
    }),
    NotFoundError,
  );
  await rejectedFixture.service.reject({
    requestId: rejected.request.id,
    actorProfileId: 'followee',
  });
  assert.equal(rejectedFixture.repository.requests.size, 0);
  assert.equal(rejectedFixture.repository.follows.size, 0);

  const cancelledFixture = createFixture();
  const cancelled = await cancelledFixture.service.followProfile({
    followerProfileId: 'follower',
    followeeProfileId: 'followee',
  });
  assert.equal(cancelled.kind, 'request');
  if (cancelled.kind !== 'request') {
    return;
  }
  await cancelledFixture.service.cancel({
    requestId: cancelled.request.id,
    actorProfileId: 'follower',
  });
  assert.equal(cancelledFixture.repository.requests.size, 0);
  assert.equal(cancelledFixture.repository.follows.size, 0);
});

test('passes remote correlation to the ActivityPub Follow boundary only on creation', async () => {
  const { service, activityEvents } = createFixture();
  const source = {
    kind: 'activitypub' as const,
    activityId: new URL('https://remote.example/activities/follow-1'),
    actorId: new URL('https://remote.example/users/alice'),
    objectId: new URL('https://local.example/ap/actor/followee'),
  };

  await service.followProfile({
    followerProfileId: 'follower',
    followeeProfileId: 'followee',
    source,
  });
  await service.followProfile({
    followerProfileId: 'follower',
    followeeProfileId: 'followee',
    source,
  });

  assert.deepEqual(activityEvents, ['created:request-1']);
});

test('creates an established follow directly for an open profile', async () => {
  const { repository, service } = createFixture();
  repository.addProfile('open-followee', ProfileFollowPolicy.OPEN);

  const result = await service.followProfile({
    followerProfileId: 'follower',
    followeeProfileId: 'open-followee',
  });

  assert.equal(result.kind, 'follow');
  assert.equal(repository.follows.size, 1);
  assert.equal(repository.requests.size, 0);
});
