import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { FeedbackPage as FeedbackPageExport } from './FeedbackPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  Platform: { OS: 'ios' },
  ScrollView: (props: object) => createElement('ScrollView', props),
  StyleSheet: { create: <T>(styles: T) => styles },
  View: 'View',
});
mockModule('@/components/PageHeader', {
  PageHeader: (props: object) => createElement('PageHeader', props),
});
mockModule('@/theme/tokens', {
  layoutRecipes: { formPageInset: {} },
  spacing: { xl: 16, xxl: 24 },
});
mockModule('./FeedbackForm', {
  FeedbackForm: () => createElement('FeedbackForm'),
});

let FeedbackPage: typeof FeedbackPageExport;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ FeedbackPage } = await import('./FeedbackPage'));
});

test('native feedback page scroll keeps the focused field above the keyboard', async () => {
  try {
    await act(async () => {
      renderer = create(createElement(FeedbackPage));
    });

    assert.ok(renderer);
    const scroll = renderer.root.find((node) => (node.type as unknown) === 'ScrollView');
    assert.equal(scroll.props.automaticallyAdjustKeyboardInsets, true);
    assert.equal(renderer.root.findByType('PageHeader' as never).props.title, '피드백 보내기');
  } finally {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});
