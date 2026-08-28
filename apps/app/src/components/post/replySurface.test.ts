import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('Reply surface selection', () => {
  it('uses the shared modal for Compact Web detail while preserving other detail layouts', async () => {
    const { getReplySurfacePresentation } = await import('./replySurface');

    assert.equal(getReplySurfacePresentation('detail', 'web', 1440), 'inline');
    assert.equal(getReplySurfacePresentation('detail', 'web', 1280), 'inline');
    assert.equal(getReplySurfacePresentation('detail', 'web', 1279), 'modal');
    assert.equal(getReplySurfacePresentation('detail', 'web', 768), 'modal');
    assert.equal(getReplySurfacePresentation('detail', 'web', 767), 'inline');
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
