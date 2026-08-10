import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBuildVersionLabel } from './buildVersion';

test('production release tag를 표시값으로 그대로 사용한다', () => {
  assert.equal(getBuildVersionLabel('v0.1.1'), 'v0.1.1');
});

test('release tag가 없으면 개발 빌드라고 표시한다', () => {
  assert.equal(getBuildVersionLabel(undefined), '개발 빌드');
  assert.equal(getBuildVersionLabel(''), '개발 빌드');
});
