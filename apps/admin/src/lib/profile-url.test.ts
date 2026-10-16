import { describe, expect, test } from 'vitest';
import { safeHttpUrl } from './profile-url';

describe('safeHttpUrl', () => {
  test('allows HTTP and HTTPS URLs and returns their normalized form', () => {
    expect(safeHttpUrl('http://example.com/avatar.png')).toBe('http://example.com/avatar.png');
    expect(safeHttpUrl('https://EXAMPLE.com/avatar.png')).toBe('https://example.com/avatar.png');
  });

  test('rejects other protocols, relative values, and malformed URLs', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:image/png;base64,abc')).toBeNull();
    expect(safeHttpUrl('/avatar.png')).toBeNull();
    expect(safeHttpUrl('not a url')).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
  });

  test('rejects URLs containing credentials', () => {
    expect(safeHttpUrl('https://viewer:secret@example.com/avatar.png')).toBeNull();
    expect(safeHttpUrl('http://viewer@example.com/avatar.png')).toBeNull();
  });
});
