import '@kosmo/core/polyfill';

import { Person } from '@fedify/vocab';
import { describe, expect, it } from 'vitest';
import { createKosmoFederation } from './federation';
import type {
  CreateLocalActorKeyInput,
  CreateLocalActorRowInput,
  LocalActorStore,
  LocalProfileActorProfile,
  StoredLocalActorKey,
  StoredLocalActorRow,
} from './local-actor-keys';

class InMemoryLocalActorStore implements LocalActorStore {
  readonly profiles = new Map<string, LocalProfileActorProfile & { localInstanceId: string }>();
  readonly actors: StoredLocalActorRow[] = [];
  readonly keys: StoredLocalActorKey[] = [];

  async findActiveLocalProfile({
    localInstanceId,
    profileId,
  }: {
    localInstanceId: string;
    profileId: string;
  }) {
    const profile = this.profiles.get(profileId);

    if (profile?.localInstanceId !== localInstanceId) {
      return undefined;
    }

    return profile;
  }

  async findActorByProfileId(profileId: string) {
    return this.actors.find((actor) => actor.profileId === profileId);
  }

  async createActor(input: CreateLocalActorRowInput) {
    const actor = {
      id: `actor-${this.actors.length + 1}`,
      profileId: input.profileId,
      uri: input.uri,
    } satisfies StoredLocalActorRow;

    this.actors.push(actor);

    return actor;
  }

  async findActorKeys(activityPubActorId: string) {
    return this.keys.filter((key) => key.activityPubActorId === activityPubActorId);
  }

  async createActorKey(input: CreateLocalActorKeyInput) {
    const key = {
      id: `key-${this.keys.length + 1}`,
      activityPubActorId: input.activityPubActorId,
      kind: input.kind,
      privateKeyJwk: input.privateKeyJwk,
      publicKeyJwk: input.publicKeyJwk,
    } satisfies StoredLocalActorKey;

    this.keys.push(key);

    return key;
  }
}

const profileId = '018f4b7c-1111-7222-8333-944455556666';
const localInstanceId = 'local-instance-1';
const localOrigin = 'https://kosmo.test';
const actorUri = new URL(`/ap/actor/${profileId}`, localOrigin);

const createStoreWithProfile = () => {
  const store = new InMemoryLocalActorStore();
  store.profiles.set(profileId, {
    id: profileId,
    localInstanceId,
    handle: 'alice',
    name: 'Alice Example',
    bio: 'Hello from Kosmo',
    createdAt: Temporal.Instant.from('2026-01-02T03:04:05Z'),
  });

  return store;
};

const createFederationWithStore = (store: LocalActorStore) =>
  createKosmoFederation({
    resolveLocalInstance: async () => ({
      id: localInstanceId,
      canonicalOrigin: localOrigin,
    }),
    store,
  });

describe('createKosmoFederation', () => {
  it('dispatches local profile actors from the configured canonical origin', async () => {
    const store = createStoreWithProfile();
    const federation = createFederationWithStore(store);
    const requestOriginContext = federation.createContext(
      new Request(new URL(actorUri.pathname, 'https://request-host.test')),
      undefined,
    );

    const actor = await requestOriginContext.getActor(profileId);

    expect(actor).toBeInstanceOf(Person);
    const person = actor as Person;
    expect(person.id?.href).toBe(actorUri.href);
    expect(person.preferredUsername).toBe('alice');
    expect(person.name).toBe('Alice Example');
    expect(person.summary).toBe('Hello from Kosmo');
    expect(person.url).toEqual(new URL('/@alice', localOrigin));
    expect(person.published?.toString()).toBe('2026-01-02T03:04:05Z');
    expect(person.inboxId?.href).toBe(`${actorUri.href}/inbox`);
    expect(person.outboxId?.href).toBe(`${actorUri.href}/outbox`);
    expect(person.followingId).toBeNull();
    expect(person.followersId).toBeNull();
    expect(person.endpoints).toBeNull();
    expect(person.publicKeyId?.href.startsWith(`${actorUri.href}#`)).toBe(true);
    expect(person.assertionMethodIds).toHaveLength(1);
    expect(person.assertionMethodIds[0]?.href.startsWith(`${actorUri.href}#`)).toBe(true);
    expect(store.actors).toEqual([
      {
        id: 'actor-1',
        profileId,
        uri: actorUri.href,
      },
    ]);
    expect(store.keys).toHaveLength(2);
  });

  it('returns null without creating actor rows when the profile is not local and active', async () => {
    const store = new InMemoryLocalActorStore();
    const federation = createFederationWithStore(store);
    const ctx = federation.createContext(new Request(actorUri), undefined);

    await expect(ctx.getActor(profileId)).resolves.toBeNull();
    expect(store.actors).toEqual([]);
    expect(store.keys).toEqual([]);
  });

  it('serves actor requests as ActivityPub JSON with canonical actor links', async () => {
    const store = createStoreWithProfile();
    const federation = createFederationWithStore(store);

    const response = await federation.fetch(
      new Request(new URL(actorUri.pathname, 'https://request-host.test'), {
        headers: { accept: 'application/activity+json' },
      }),
      { contextData: undefined },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/activity+json');

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.id).toBe(actorUri.href);
    expect(body.preferredUsername).toBe('alice');
    expect(body.url).toBe(new URL('/@alice', localOrigin).href);
    expect(body.inbox).toBe(`${actorUri.href}/inbox`);
    expect(body.outbox).toBe(`${actorUri.href}/outbox`);
    expect(body.following).toBeUndefined();
    expect(body.followers).toBeUndefined();
    expect(body.endpoints).toBeUndefined();
  });
  it('leaves advertised inbox and outbox endpoints unsupported for now', async () => {
    const store = createStoreWithProfile();
    const federation = createFederationWithStore(store);

    for (const path of ['/inbox', '/outbox'] as const) {
      const response = await federation.fetch(
        new Request(new URL(`${actorUri.pathname}${path}`, localOrigin), {
          headers: { accept: 'application/activity+json' },
        }),
        { contextData: undefined },
      );

      expect(response.status).toBe(404);
    }
  });
});
