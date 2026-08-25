import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeRouteTemplate } from './route';

describe('normalizeRouteTemplate', () => {
  it('route group과 index를 제거하고 dynamic segment placeholder를 보존한다', () => {
    assert.equal(
      normalizeRouteTemplate(['(tabs)', '(profile)', '[profileHandle]']),
      '/[profileHandle]',
    );
    assert.equal(normalizeRouteTemplate(['(tabs)', '(protected)', 'search']), '/search');
    assert.equal(normalizeRouteTemplate(['index']), '/');
  });

  it('actual pathname이나 query 값이 아닌 file segment만 사용한다', () => {
    assert.equal(
      normalizeRouteTemplate(['(tabs)', '(profile)', '[profileHandle]', '[postId]']),
      '/[profileHandle]/[postId]',
    );
  });

  it('empty segment는 root route로 정규화한다', () => {
    assert.equal(normalizeRouteTemplate([]), '/');
    assert.equal(normalizeRouteTemplate(['(tabs)', 'index']), '/');
  });
});
