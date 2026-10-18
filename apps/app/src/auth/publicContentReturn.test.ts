import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSignupHomeHref, isSafePublicContentReturnTarget } from './publicContentReturn';

describe('public content return targets', () => {
  it('accepts only public Profile and Post pathnames', () => {
    assert.equal(isSafePublicContentReturnTarget('/@writer'), true);
    assert.equal(isSafePublicContentReturnTarget('/@writer/post-id'), true);
    assert.equal(isSafePublicContentReturnTarget('/@writer/%2Fpost-id'), false);
    assert.equal(isSafePublicContentReturnTarget('/@writer/../settings'), false);
    assert.equal(isSafePublicContentReturnTarget('/@writer?next=/settings'), false);
    assert.equal(isSafePublicContentReturnTarget('/@writer/followers'), false);
    assert.equal(isSafePublicContentReturnTarget('/@writer/%00'), false);
    assert.equal(isSafePublicContentReturnTarget('/@writer/%7f'), false);
    assert.equal(isSafePublicContentReturnTarget('//outside.example'), false);
    assert.equal(isSafePublicContentReturnTarget('https://outside.example/@writer'), false);
    assert.equal(isSafePublicContentReturnTarget('/login'), false);
  });

  it('carries only a safe public target in a signup-home URL', () => {
    assert.equal(buildSignupHomeHref('/@writer/post-id'), '/?returnTo=%2F%40writer%2Fpost-id');
    assert.equal(buildSignupHomeHref('//outside.example'), '/');
    assert.equal(buildSignupHomeHref('/settings'), '/');
    assert.equal(buildSignupHomeHref(null), '/');
  });
});
