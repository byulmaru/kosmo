import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getPublicContentInvitationPlacement } from './publicContentInvitationLayout';

describe('public content invitation placement', () => {
  it('keeps the invitation in the document when the viewport is too short', () => {
    assert.deepEqual(
      getPublicContentInvitationPlacement({ height: 480, safeAreaBottom: 0, width: 390 }),
      { mode: 'flow' },
    );
  });

  it('places the mobile invitation above the bottom tabs and safe area', () => {
    assert.deepEqual(
      getPublicContentInvitationPlacement({ height: 844, safeAreaBottom: 24, width: 390 }),
      { bottom: 104, left: 0, mode: 'fixed', right: 0 },
    );
  });

  it('aligns compact Web with the 80px icon rail and 600px content column', () => {
    assert.deepEqual(
      getPublicContentInvitationPlacement({ height: 900, safeAreaBottom: 0, width: 1024 }),
      {
        bottom: 0,
        left: 'calc((100vw - 680px) / 2 + 80px)',
        mode: 'fixed',
        right: 'calc((100vw - 680px) / 2)',
      },
    );
  });

  it('aligns full Web with the existing 320px rails and 600px center column', () => {
    assert.deepEqual(
      getPublicContentInvitationPlacement({ height: 900, safeAreaBottom: 12, width: 1440 }),
      {
        bottom: 12,
        left: 'calc((100vw - 1240px) / 2 + 320px)',
        mode: 'fixed',
        right: 'calc((100vw - 1240px) / 2 + 320px)',
      },
    );
  });
});
