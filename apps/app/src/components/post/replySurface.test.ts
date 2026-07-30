import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('Reply surface selection', () => {
  it('keeps detail rows inline regardless of platform or viewport width', async () => {
    const { getReplySurfacePresentation } = await import('./replySurface');

    assert.equal(getReplySurfacePresentation('detail', 'web', 1440), 'inline');
    assert.equal(getReplySurfacePresentation('detail', 'web', 390), 'inline');
    assert.equal(getReplySurfacePresentation('detail', 'ios', 1024), 'inline');
  });

  it('uses a modal only for wide Web list surfaces', async () => {
    const { getReplySurfacePresentation } = await import('./replySurface');

    assert.equal(getReplySurfacePresentation('list', 'web', 768), 'modal');
    assert.equal(getReplySurfacePresentation('list', 'web', 767), 'fullscreen');
    assert.equal(getReplySurfacePresentation('list', 'android', 1440), 'fullscreen');
    assert.equal(getReplySurfacePresentation('list', 'ios', 1440), 'fullscreen');
  });
});

describe('Reply display Post eligibility', () => {
  it('does not inherit Reply eligibility from a contentful Repost Source', async () => {
    const { getReplyProcessingState } = await import('./replySurface');

    assert.equal(getReplyProcessingState(true, false), 'disabled');
    assert.equal(getReplyProcessingState(false, false), 'disabled');
    assert.equal(getReplyProcessingState(false, true), 'disabled');
    assert.equal(getReplyProcessingState(true, true), 'default');
  });
});
