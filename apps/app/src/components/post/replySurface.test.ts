import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('Reply surface selection', () => {
  it('uses the same responsive surface for detail and list owners', async () => {
    const { getReplySurfacePresentation } = await import('./replySurface');

    assert.equal(getReplySurfacePresentation('web', 1440), 'modal');
    assert.equal(getReplySurfacePresentation('web', 390), 'fullscreen');
    assert.equal(getReplySurfacePresentation('ios', 1024), 'fullscreen');
    assert.equal(getReplySurfacePresentation('web', 768), 'modal');
    assert.equal(getReplySurfacePresentation('web', 767), 'fullscreen');
    assert.equal(getReplySurfacePresentation('android', 1440), 'fullscreen');
    assert.equal(getReplySurfacePresentation('ios', 1440), 'fullscreen');
  });
});

describe('Reply display Post eligibility', () => {
  it('target/session disabled와 resolution-only 실행을 구분한다', async () => {
    const { getReplyProcessingState } = await import('./replySurface');

    assert.equal(getReplyProcessingState({ kind: 'disabled', reason: 'target' }, true), 'disabled');
    assert.equal(
      getReplyProcessingState({ kind: 'disabled', reason: 'session-error' }, true),
      'disabled',
    );
    assert.equal(
      getReplyProcessingState({ kind: 'resolution-required', reason: 'guest' }, false),
      'default',
    );
    assert.equal(
      getReplyProcessingState({ kind: 'resolution-required', reason: 'profile' }, false),
      'default',
    );
    assert.equal(getReplyProcessingState({ kind: 'enabled' }, false), 'disabled');
    assert.equal(getReplyProcessingState({ kind: 'enabled' }, true), 'default');
  });
});
