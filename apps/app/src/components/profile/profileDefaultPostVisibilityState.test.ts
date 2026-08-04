import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('Profile default Post Visibility state', () => {
  it('uses UNLISTED for an unavailable value without borrowing another Profile', async () => {
    const { resolveProfileDefaultVisibility } = await import('./profileDefaultPostVisibilityState');

    assert.equal(resolveProfileDefaultVisibility(null), 'UNLISTED');
    assert.equal(resolveProfileDefaultVisibility(undefined), 'UNLISTED');
    assert.equal(resolveProfileDefaultVisibility('PUBLIC'), 'PUBLIC');
  });
});
