import { describe, expect, it } from 'vitest';
import { buildActorScopedUri } from './actor-uri';

describe('buildActorScopedUri', () => {
  it('appends inbox and outbox below the actor URI instead of replacing the identifier', () => {
    const actorUri = new URL('https://kosmo.test/ap/actor/018f4b7c-1111-7222-8333-944455556666');

    expect(buildActorScopedUri(actorUri, 'inbox').href).toBe(
      'https://kosmo.test/ap/actor/018f4b7c-1111-7222-8333-944455556666/inbox',
    );
    expect(buildActorScopedUri(actorUri, 'outbox').href).toBe(
      'https://kosmo.test/ap/actor/018f4b7c-1111-7222-8333-944455556666/outbox',
    );
  });

  it('normalizes actor URIs that already include a trailing slash', () => {
    const actorUri = new URL('https://kosmo.test/ap/actor/018f4b7c-1111-7222-8333-944455556666/');

    expect(buildActorScopedUri(actorUri, 'inbox').href).toBe(
      'https://kosmo.test/ap/actor/018f4b7c-1111-7222-8333-944455556666/inbox',
    );
  });
});
