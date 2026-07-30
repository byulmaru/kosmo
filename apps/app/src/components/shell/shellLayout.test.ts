import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getShellLayout, getWebMobileShellHeaderStickyOffset } from './shellLayout';

describe('getShellLayout', () => {
  it('keeps native tablets on the mobile shell', () => {
    assert.equal(getShellLayout(false, 1_024), 'mobile');
  });

  it('applies compact and full breakpoints only on web', () => {
    assert.equal(getShellLayout(true, 767), 'mobile');
    assert.equal(getShellLayout(true, 768), 'compact');
    assert.equal(getShellLayout(true, 1_280), 'full');
  });

  it('offsets a Web mobile detail header below the shell header only', () => {
    assert.equal(getWebMobileShellHeaderStickyOffset(767), 64);
    assert.equal(getWebMobileShellHeaderStickyOffset(768), 0);
    assert.equal(getWebMobileShellHeaderStickyOffset(1_280), 0);
  });
});
