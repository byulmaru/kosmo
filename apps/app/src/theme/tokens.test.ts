import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as tokens from './tokens';

test('density는 기존 spacing scale을 시맨틱 preset으로 제공한다', () => {
  assert.deepEqual((tokens as Record<string, unknown>).density, {
    compact: { inset: 12, stack: 8, section: 16 },
    standard: { inset: 16, stack: 12, section: 24 },
    spacious: { inset: 24, stack: 16, section: 32 },
  });
});

test('layout recipe는 승인된 form, list, Web ActionMenu geometry를 제공한다', () => {
  assert.deepEqual((tokens as Record<string, unknown>).layoutRecipes, {
    formStack: { flexDirection: 'column', gap: 16 },
    formPageInset: { paddingHorizontal: 16 },
    listStack: { flexDirection: 'column', gap: 0, padding: 0 },
    listRow: {
      alignItems: 'center',
      borderRadius: 0,
      flexDirection: 'row',
      gap: 12,
      minHeight: 64,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    actionMenuSurface: {
      flexDirection: 'column',
      gap: 0,
      padding: 4,
      borderRadius: 12,
    },
  });
});
