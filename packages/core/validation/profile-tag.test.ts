import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeProfileTagDisplayName,
  normalizeProfileTagName,
  profileTagNameSchema,
  profileTagsInputSchema,
  profileTagsSchema,
} from './profile-tag';
import {
  profileTagDuplicateParityCases,
  profileTagInvalidParityCases,
  profileTagNormalizationParityCases,
} from './profile-tag-parity-fixture';

test('Profile Tag normalizer separates NFKC display name from lowercase canonical name', () => {
  for (const { displayName, input, normalized } of profileTagNormalizationParityCases) {
    assert.equal(normalizeProfileTagDisplayName(input), displayName);
    assert.equal(normalizeProfileTagName(input), normalized);
    assert.equal(profileTagNameSchema.parse(input), normalized);
  }
  assert.equal(normalizeProfileTagName('ı'), 'ı');
});

test('Profile Tag name schema accepts valid normalized names', () => {
  assert.equal(profileTagNameSchema.parse('  #Kosmo_1  '), 'kosmo_1');
  assert.equal(profileTagNameSchema.parse('𝔘𝔫𝔦𝔠𝔬𝔡𝔢'), 'unicode');
  assert.equal(profileTagNameSchema.parse('한글'), '한글');
  assert.equal(profileTagNameSchema.parse('𐐀'.repeat(20)), '𐐨'.repeat(20));
});

test('Profile Tag name schema rejects invalid normalized names', () => {
  for (const value of ['', '   ', '#', 'hello-world', 'hello!', 'İ', 'a'.repeat(21)]) {
    assert.throws(() => profileTagNameSchema.parse(value));
  }
  for (const { input } of profileTagInvalidParityCases) {
    assert.throws(() => profileTagNameSchema.parse(input));
  }
});

test('Profile Tags schema returns the normalized service representation', () => {
  assert.deepEqual(profileTagsSchema.parse(['  #Ｆｏｏ  ', '𝔘𝔫𝔦𝔠𝔬𝔡𝔢', '한글']), [
    { displayName: 'Foo', name: 'foo' },
    { displayName: 'Unicode', name: 'unicode' },
    { displayName: '한글', name: '한글' },
  ]);
  assert.deepEqual(profileTagsSchema.parse(['𐐀'.repeat(20)]), [
    { displayName: '𐐀'.repeat(20), name: '𐐨'.repeat(20) },
  ]);
});

test('Profile Tags schema preserves validation and duplicate error contracts', () => {
  const invalid = profileTagsSchema.safeParse(['hello-world']);
  assert.equal(invalid.success, false);
  assert.deepEqual(invalid.error.issues, [
    {
      code: 'custom',
      message: 'Profile Tag는 1~20자의 문자, 숫자 또는 밑줄만 사용할 수 있어요.',
      path: [0],
    },
  ]);

  assert.equal(profileTagsSchema.safeParse(['𐐀'.repeat(21)]).success, false);
  for (const { input } of profileTagInvalidParityCases) {
    assert.equal(profileTagsSchema.safeParse([input]).success, false);
  }

  const duplicate = profileTagsSchema.safeParse(['#Foo', ' foo ']);
  assert.equal(duplicate.success, false);
  assert.deepEqual(duplicate.error.issues, [
    {
      code: 'custom',
      message: '정규화한 Profile Tag는 중복될 수 없어요.',
      path: [1],
    },
  ]);
  for (const { existing, input } of profileTagDuplicateParityCases) {
    assert.equal(profileTagsSchema.safeParse([existing, input]).success, false);
  }
});

test('Profile Tags schema allows arbitrary counts', () => {
  assert.equal(profileTagsSchema.parse(['a', 'b', 'c', 'd', 'e', 'f']).length, 6);
});

test('Profile Tags input distinguishes omitted and null from replacement arrays', () => {
  assert.equal(profileTagsInputSchema.parse(undefined), undefined);
  assert.equal(profileTagsInputSchema.parse(null), null);
  assert.deepEqual(profileTagsInputSchema.parse([]), []);
  assert.deepEqual(profileTagsInputSchema.parse(['  #Ｆｏｏ  ']), ['  #Ｆｏｏ  ']);
});

test('Profile Tags input preserves validation and duplicate error contracts', () => {
  const invalid = profileTagsInputSchema.safeParse(['hello-world']);
  assert.equal(invalid.success, false);
  assert.deepEqual(invalid.error.issues, [
    {
      code: 'custom',
      message: 'Profile Tag는 1~20자의 문자, 숫자 또는 밑줄만 사용할 수 있어요.',
      path: [0],
    },
  ]);

  const duplicate = profileTagsInputSchema.safeParse(['#Foo', ' foo ']);
  assert.equal(duplicate.success, false);
  assert.deepEqual(duplicate.error.issues, [
    {
      code: 'custom',
      message: '정규화한 Profile Tag는 중복될 수 없어요.',
      path: [1],
    },
  ]);
});
