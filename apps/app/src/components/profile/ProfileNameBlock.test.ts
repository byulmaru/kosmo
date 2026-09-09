import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { ProfileNameBlock as ProfileNameBlockExport } from './ProfileNameBlock';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-router', { Link: 'Link' });
mockModule('react-native', {
  Pressable: 'Pressable',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('react-relay', {
  graphql: () => ({}),
  useFragment: () => ({
    displayName: '아주 긴 표시 이름이 한 줄을 넘을 수 있습니다',
    relativeHandle: '@very-long-relative-handle-that-must-stay-on-one-line',
  }),
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    text: '#111111',
    textSecondary: '#666666',
    foregroundPrimary: '#1a1a1a',
    foregroundSecondary: '#64646f',
  }),
});
let ProfileNameBlock: typeof ProfileNameBlockExport;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ ProfileNameBlock } = await import('./ProfileNameBlock'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  mock.restoreAll();
});

for (const variant of ['default', 'compact', 'hero'] as const) {
  test(`ProfileNameBlock ${variant} preserves text and heading semantics`, async () => {
    await act(async () => {
      renderer = create(createElement(ProfileNameBlock, { profile: {} as never, variant }));
    });

    assert.ok(renderer);
    const textNodes = renderer.root.findAll((node) => (node.type as unknown) === 'Text');
    const hero = variant === 'hero';
    assert.deepEqual(
      textNodes.map((node) => ({
        numberOfLines: node.props.numberOfLines,
        role: node.props.accessibilityRole,
        value: node.children.join(''),
      })),
      [
        {
          numberOfLines: hero ? undefined : 1,
          role: hero ? 'header' : undefined,
          value: '아주 긴 표시 이름이 한 줄을 넘을 수 있습니다',
        },
        {
          numberOfLines: hero ? undefined : 1,
          role: undefined,
          value: '@very-long-relative-handle-that-must-stay-on-one-line',
        },
      ],
    );
  });
}
