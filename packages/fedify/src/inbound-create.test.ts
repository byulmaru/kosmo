import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Create } from '@fedify/vocab';
import { createInboundCreateMaterializationInput } from './inbound-create';
import type { InboundCreateMaterializationInput } from './inbound-create';

describe('inbound Create materialization input', () => {
  test('uses Create.id.href as the route-independent global activity key', () => {
    const activityId = new URL('https://remote.example/activities/create-1');
    const activity = new Create({ id: activityId });
    const receivedAt = Temporal.Instant.from('2026-07-14T00:00:00Z');

    const personalInboxInput = createInboundCreateMaterializationInput(activity, receivedAt);
    const sharedInboxInput = createInboundCreateMaterializationInput(activity, receivedAt);

    assert.deepEqual(personalInboxInput, {
      activityId: activityId.href,
      receivedAt,
    });
    assert.deepEqual(sharedInboxInput, personalInboxInput);
  });

  test('does not scope the key by actor, object, recipient, route, or worker', () => {
    const activityId = new URL('https://remote.example/activities/create-1');
    const receivedAt = Temporal.Instant.from('2026-07-14T00:00:00Z');

    const firstDelivery = createInboundCreateMaterializationInput(
      new Create({
        id: activityId,
        actor: new URL('https://remote.example/users/alice'),
        object: new URL('https://remote.example/notes/1'),
      }),
      receivedAt,
    );
    const changedDelivery = createInboundCreateMaterializationInput(
      new Create({
        id: activityId,
        actor: new URL('https://other.example/users/bob'),
        object: new URL('https://other.example/notes/2'),
      }),
      receivedAt,
    );

    assert.equal(firstDelivery?.activityId, activityId.href);
    assert.equal(changedDelivery?.activityId, activityId.href);
  });

  test('rejects a missing or invalid activity id', () => {
    assert.equal(
      createInboundCreateMaterializationInput(new Create({}), Temporal.Now.instant()),
      null,
    );
    assert.equal(
      createInboundCreateMaterializationInput(
        { id: { href: '/activities/create-1' } } as unknown as Pick<Create, 'id'>,
        Temporal.Now.instant(),
      ),
      null,
    );
  });

  test('requires activityId and receivedAt in the materialization input contract', () => {
    const input = {
      activityId: 'https://remote.example/activities/create-1',
      receivedAt: Temporal.Instant.from('2026-07-14T00:00:00Z'),
    } satisfies InboundCreateMaterializationInput;

    assert.equal(input.activityId, 'https://remote.example/activities/create-1');
  });
});
