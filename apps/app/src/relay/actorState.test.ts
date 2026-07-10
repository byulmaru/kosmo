import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { initialActorState, reduceActorState } from './actorState';

describe('Relay actor state', () => {
  it('changes the actor key and revision after profile selection', () => {
    assert.deepEqual(
      reduceActorState(initialActorState, { type: 'profile-selected', profileId: 'profile-2' }),
      { id: 'profile-2', revision: 1 },
    );
  });

  it('keeps the actor and bumps the revision for retry', () => {
    assert.deepEqual(reduceActorState({ id: 'profile-2', revision: 3 }, { type: 'retry' }), {
      id: 'profile-2',
      revision: 4,
    });
  });
});
