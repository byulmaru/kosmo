import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('Profile default Post Visibility state', () => {
  it('uses UNLISTED for an unavailable value without borrowing another Profile', async () => {
    const { profileDefaultVisibilityFallback, resolveProfileDefaultVisibility } =
      await import('./profileDefaultPostVisibilityState');

    assert.equal(resolveProfileDefaultVisibility(null), profileDefaultVisibilityFallback);
    assert.equal(resolveProfileDefaultVisibility(undefined), profileDefaultVisibilityFallback);
    assert.equal(resolveProfileDefaultVisibility('PUBLIC'), 'PUBLIC');
  });

  it('only becomes dirty after an explicit selection change', async () => {
    const { isProfileDefaultVisibilityDirty } = await import('./profileDefaultPostVisibilityState');

    assert.equal(isProfileDefaultVisibilityDirty('PUBLIC', 'PUBLIC'), false);
    assert.equal(isProfileDefaultVisibilityDirty('PUBLIC', 'FOLLOWERS'), true);
  });
});
