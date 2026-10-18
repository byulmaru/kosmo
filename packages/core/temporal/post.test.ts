import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProfileLimitExceededError } from '../error';
import { unwrapPostTransition } from './post';

test('Post transition restores Profile limit rejection added by the shared error contract', () => {
  assert.throws(
    () =>
      unwrapPostTransition({
        ok: false,
        error: { code: 'PROFILE_LIMIT_EXCEEDED', message: 'Profile limit reached' },
      }),
    ProfileLimitExceededError,
  );
});
