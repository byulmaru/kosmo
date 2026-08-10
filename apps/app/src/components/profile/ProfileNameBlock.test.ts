import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { ProfileNameBlockView as ProfileNameBlockViewExport } from './ProfileNameBlock';

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
mockModule('react-relay', { graphql: () => ({}), useFragment: () => undefined });
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ text: '#111111', textSecondary: '#666666' }),
});
mockModule('@/theme/tokens', {
  radii: { md: 8 },
  typography: { md: { fontSize: 16, lineHeight: 24 }, sm: { fontSize: 14, lineHeight: 20 } },
});

let ProfileNameBlockView: typeof ProfileNameBlockViewExport;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ ProfileNameBlockView } = await import('./ProfileNameBlock'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  mock.restoreAll();
});

test('ProfileNameBlockView truncates long display names and handles to one line', async () => {
  assert.ok(ProfileNameBlockView);
  await act(async () => {
    renderer = create(
      createElement(ProfileNameBlockView, {
        displayName: '아주 긴 표시 이름이 한 줄을 넘을 수 있습니다',
        relativeHandle: '@very-long-relative-handle-that-must-stay-on-one-line',
      }),
    );
  });

  assert.ok(renderer);
  const textNodes = renderer.root.findAll((node) => (node.type as unknown) === 'Text');
  assert.deepEqual(
    textNodes.map((node) => ({
      numberOfLines: node.props.numberOfLines,
      value: node.children.join(''),
    })),
    [
      {
        numberOfLines: 1,
        value: '아주 긴 표시 이름이 한 줄을 넘을 수 있습니다',
      },
      {
        numberOfLines: 1,
        value: '@very-long-relative-handle-that-must-stay-on-one-line',
      },
    ],
  );
});
