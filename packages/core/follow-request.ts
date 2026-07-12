import { ProfileFollowPolicy, ProfileState } from './enums';
import { ConflictError, NotFoundError } from './error';
import type { ProfileFollowPolicy as ProfileFollowPolicyValue } from './enums';

export type FollowRequestRow = {
  id: string;
  followerProfileId: string;
  followeeProfileId: string;
  createdAt: Temporal.Instant;
};

export type FollowRow = {
  id: string;
  followerProfileId: string;
  followeeProfileId: string;
  createdAt: Temporal.Instant;
};

export type FollowRequestProfile = {
  id: string;
  state: string;
  followPolicy: ProfileFollowPolicyValue;
};

export type FollowRequestSource =
  | { kind: 'local' }
  | { kind: 'activitypub'; activityId: URL; actorId: URL; objectId: URL };

export type FollowRequestDisposition = 'accepted' | 'rejected';

export type FollowRequestNotificationPort = {
  created(event: { request: FollowRequestRow }): Promise<void>;
  removed(event: {
    request: FollowRequestRow;
    reason: FollowRequestDisposition | 'cancelled';
  }): Promise<void>;
};

export type ActivityPubFollowPort = {
  requestCreated(event: {
    request: FollowRequestRow;
    source: Extract<FollowRequestSource, { kind: 'activitypub' }>;
  }): Promise<void>;
  respond(event: {
    request: FollowRequestRow;
    disposition: FollowRequestDisposition;
  }): Promise<void>;
};

export type FollowRequestStore = {
  lockPair(followerProfileId: string, followeeProfileId: string): Promise<void>;
  findProfile(id: string): Promise<FollowRequestProfile | undefined>;
  findFollow(followerProfileId: string, followeeProfileId: string): Promise<FollowRow | undefined>;
  findRequest(
    followerProfileId: string,
    followeeProfileId: string,
  ): Promise<FollowRequestRow | undefined>;
  findRequestById(id: string): Promise<FollowRequestRow | undefined>;
  insertFollow(followerProfileId: string, followeeProfileId: string): Promise<FollowRow>;
  insertRequest(followerProfileId: string, followeeProfileId: string): Promise<FollowRequestRow>;
  deleteRequest(id: string): Promise<FollowRequestRow | undefined>;
};

export type FollowRequestRepository = {
  transaction<T>(callback: (store: FollowRequestStore) => Promise<T>): Promise<T>;
};

export type FollowProfileResult =
  | { kind: 'follow'; follow: FollowRow; removedRequest?: FollowRequestRow }
  | { kind: 'request'; request: FollowRequestRow; created: boolean };

const noopNotificationPort: FollowRequestNotificationPort = {
  created: async () => undefined,
  removed: async () => undefined,
};

const noopActivityPubPort: ActivityPubFollowPort = {
  requestCreated: async () => undefined,
  respond: async () => undefined,
};

export class FollowRequestService {
  readonly #repository: FollowRequestRepository;
  readonly #notifications: FollowRequestNotificationPort;
  readonly #activityPub: ActivityPubFollowPort;

  constructor({
    repository,
    notifications = noopNotificationPort,
    activityPub = noopActivityPubPort,
  }: {
    repository: FollowRequestRepository;
    notifications?: FollowRequestNotificationPort;
    activityPub?: ActivityPubFollowPort;
  }) {
    this.#repository = repository;
    this.#notifications = notifications;
    this.#activityPub = activityPub;
  }

  async followProfile({
    followerProfileId,
    followeeProfileId,
    source = { kind: 'local' },
  }: {
    followerProfileId: string;
    followeeProfileId: string;
    source?: FollowRequestSource;
  }): Promise<FollowProfileResult> {
    if (followerProfileId === followeeProfileId) {
      throw new ConflictError({ message: 'Profile cannot follow itself', field: 'id' });
    }

    const result: FollowProfileResult = await this.#repository.transaction(async (store) => {
      await store.lockPair(followerProfileId, followeeProfileId);

      const [follower, followee] = await Promise.all([
        store.findProfile(followerProfileId),
        store.findProfile(followeeProfileId),
      ]);

      if (!follower || follower.state !== ProfileState.ACTIVE) {
        throw new NotFoundError('Follower profile not found');
      }
      if (!followee || followee.state !== ProfileState.ACTIVE) {
        throw new NotFoundError('Profile not found');
      }

      const [existingFollow, existingRequest] = await Promise.all([
        store.findFollow(followerProfileId, followeeProfileId),
        store.findRequest(followerProfileId, followeeProfileId),
      ]);
      if (existingFollow) {
        const removedRequest = existingRequest
          ? await store.deleteRequest(existingRequest.id)
          : undefined;
        return { kind: 'follow', follow: existingFollow, removedRequest } as const;
      }

      if (followee.followPolicy === ProfileFollowPolicy.OPEN) {
        const follow = await store.insertFollow(followerProfileId, followeeProfileId);
        const removedRequest = existingRequest
          ? await store.deleteRequest(existingRequest.id)
          : undefined;
        return { kind: 'follow', follow, removedRequest } as const;
      }

      if (existingRequest) {
        return { kind: 'request', request: existingRequest, created: false } as const;
      }

      const request = await store.insertRequest(followerProfileId, followeeProfileId);
      return { kind: 'request', request, created: true } as const;
    });

    if (result.kind === 'follow' && result.removedRequest) {
      await this.#notifications.removed({ request: result.removedRequest, reason: 'cancelled' });
    }
    if (result.kind === 'request' && result.created) {
      await this.#notifications.created({ request: result.request });
      if (source.kind === 'activitypub') {
        await this.#activityPub.requestCreated({ request: result.request, source });
      }
    }

    return result;
  }

  async approve({ requestId, actorProfileId }: { requestId: string; actorProfileId: string }) {
    const result = await this.#repository.transaction(async (store) => {
      const request = await this.#findRequestForRole(store, requestId, actorProfileId, 'followee');
      await store.lockPair(request.followerProfileId, request.followeeProfileId);

      const [follower, followee] = await Promise.all([
        store.findProfile(request.followerProfileId),
        store.findProfile(request.followeeProfileId),
      ]);
      if (
        !follower ||
        follower.state !== ProfileState.ACTIVE ||
        !followee ||
        followee.state !== ProfileState.ACTIVE
      ) {
        throw new ConflictError({ message: 'Follow request participants must be active' });
      }

      const follow =
        (await store.findFollow(request.followerProfileId, request.followeeProfileId)) ??
        (await store.insertFollow(request.followerProfileId, request.followeeProfileId));
      const deleted = await store.deleteRequest(request.id);
      if (!deleted) {
        throw new NotFoundError('Follow request not found');
      }
      return { request: deleted, follow };
    });

    await this.#notifications.removed({ request: result.request, reason: 'accepted' });
    await this.#activityPub.respond({ request: result.request, disposition: 'accepted' });
    return result;
  }

  async reject({ requestId, actorProfileId }: { requestId: string; actorProfileId: string }) {
    const request = await this.#removeForRole(requestId, actorProfileId, 'followee');
    await this.#notifications.removed({ request, reason: 'rejected' });
    await this.#activityPub.respond({ request, disposition: 'rejected' });
    return request;
  }

  async cancel({ requestId, actorProfileId }: { requestId: string; actorProfileId: string }) {
    const request = await this.#removeForRole(requestId, actorProfileId, 'follower');
    await this.#notifications.removed({ request, reason: 'cancelled' });
    return request;
  }

  async #removeForRole(requestId: string, actorProfileId: string, role: 'follower' | 'followee') {
    return this.#repository.transaction(async (store) => {
      const request = await this.#findRequestForRole(store, requestId, actorProfileId, role);
      await store.lockPair(request.followerProfileId, request.followeeProfileId);
      const deleted = await store.deleteRequest(request.id);
      if (!deleted) {
        throw new NotFoundError('Follow request not found');
      }
      return deleted;
    });
  }

  async #findRequestForRole(
    store: FollowRequestStore,
    requestId: string,
    actorProfileId: string,
    role: 'follower' | 'followee',
  ) {
    const request = await store.findRequestById(requestId);
    const participantId =
      role === 'follower' ? request?.followerProfileId : request?.followeeProfileId;
    if (!request || participantId !== actorProfileId) {
      throw new NotFoundError('Follow request not found');
    }
    return request;
  }
}
