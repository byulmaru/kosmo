import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  consumeHomeReturnTarget,
  isSafePublicContentReturnTarget,
  saveHomeReturnTarget,
} from './publicContentReturn';

function createStorage() {
  const values = new Map<string, string>();

  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

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

  it('stores a valid public location for the signup home and consumes it once', () => {
    const storage = createStorage();

    saveHomeReturnTarget('/@writer/post-id', storage);

    assert.equal(consumeHomeReturnTarget(storage), '/@writer/post-id');
    assert.equal(consumeHomeReturnTarget(storage), null);
  });

  it('does not retain an invalid location for the signup home', () => {
    const storage = createStorage();

    saveHomeReturnTarget('//outside.example', storage);

    assert.equal(consumeHomeReturnTarget(storage), null);
  });
});
