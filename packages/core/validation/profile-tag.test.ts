import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeProfileTagDisplayName,
  normalizeProfileTagName,
  profileTagNameSchema,
  profileTagsInputSchema,
  profileTagsSchema,
} from './profile-tag';

test('Profile Tag normalizer separates NFKC display name from lowercase canonical name', () => {
  assert.equal(normalizeProfileTagDisplayName('  #Ｆｏｏ  '), 'Foo');
  assert.equal(normalizeProfileTagName('  #Ｆｏｏ  '), 'foo');
  assert.equal(normalizeProfileTagName('Straße'), 'straße');
  assert.equal(normalizeProfileTagName('ı'), 'ı');
});

test('Profile Tag name schema accepts valid normalized names', () => {
  assert.equal(profileTagNameSchema.parse('  #Kosmo_1  '), 'kosmo_1');
  assert.equal(profileTagNameSchema.parse('𝔘𝔫𝔦𝔠𝔬𝔡𝔢'), 'unicode');
  assert.equal(profileTagNameSchema.parse('한글'), '한글');
  assert.equal(profileTagNameSchema.parse('𐐀'.repeat(20)), '𐐨'.repeat(20));
});

test('Profile Tag name schema rejects invalid normalized names', () => {
  for (const value of [
    '',
    '   ',
    '#',
    'hello-world',
    'hello!',
    'İ',
    'a'.repeat(21),
    '𐐀'.repeat(21),
  ]) {
    assert.throws(() => profileTagNameSchema.parse(value));
  }
});

test('Profile Tags schema allows arbitrary counts and enforces normalized uniqueness', () => {
  assert.deepEqual(profileTagsSchema.parse(['#Foo', 'bar']), [
    { displayName: 'Foo', name: 'foo' },
    { displayName: 'bar', name: 'bar' },
  ]);
  assert.throws(() => profileTagsSchema.parse(['#Foo', ' foo ']));
  assert.deepEqual(profileTagsSchema.parse(['a', 'b', 'c', 'd', 'e', 'f']), [
    { displayName: 'a', name: 'a' },
    { displayName: 'b', name: 'b' },
    { displayName: 'c', name: 'c' },
    { displayName: 'd', name: 'd' },
    { displayName: 'e', name: 'e' },
    { displayName: 'f', name: 'f' },
  ]);
});

test('Profile Tags input distinguishes omitted and null from replacement arrays', () => {
  assert.equal(profileTagsInputSchema.parse(undefined), undefined);
  assert.equal(profileTagsInputSchema.parse(null), null);
  assert.deepEqual(profileTagsInputSchema.parse([]), []);
  assert.deepEqual(profileTagsInputSchema.parse(['#Foo']), ['#Foo']);
});
