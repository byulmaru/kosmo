import { describe, expect, test } from 'vitest';
import { normalizeIdentityHeader } from './identity';

describe('Admin Console identity normalization', () => {
  test('normalizes plain values and UTF-8 Q encoded words', () => {
    expect(normalizeIdentityHeader(' viewer@example.com ')).toBe('viewer@example.com');
    expect(normalizeIdentityHeader('=?UTF-8?Q?=EC=9A=B4=EC=98=81=EC=9E=90_=28Admin=29?=')).toBe(
      '운영자 (Admin)',
    );
    expect(normalizeIdentityHeader('=?UTF-8?Q?100%_ready?=')).toBe('100% ready');
  });

  test('rejects malformed, unsupported, invalid UTF-8, empty, and control values', () => {
    expect(normalizeIdentityHeader('=?UTF-8?Q?bad=XX?=')).toBeUndefined();
    expect(normalizeIdentityHeader('=?UTF-8?Q?=FF?=')).toBeUndefined();
    expect(normalizeIdentityHeader('=?ISO-8859-1?Q?viewer?=')).toBeUndefined();
    expect(normalizeIdentityHeader('   ')).toBeUndefined();
    expect(normalizeIdentityHeader('viewer\u0000')).toBeUndefined();
  });
});
