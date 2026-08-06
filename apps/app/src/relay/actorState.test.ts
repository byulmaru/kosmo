import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { initialActorState, reduceActorState } from './actorState';

describe('Relay actor state', () => {
  it('changes the actor key after profile selection', () => {
    assert.deepEqual(
      reduceActorState(initialActorState, { type: 'profile-selected', profileId: 'profile-2' }),
      { id: 'profile-2' },
    );
  });

  it('keeps the selected actor when the same profile is selected again', () => {
    assert.deepEqual(
      reduceActorState({ id: 'profile-2' }, { type: 'profile-selected', profileId: 'profile-2' }),
      {
        id: 'profile-2',
      },
    );
  });
});
