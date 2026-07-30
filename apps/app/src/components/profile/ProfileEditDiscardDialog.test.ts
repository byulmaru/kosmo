import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { ProfileEditDiscardDialog as ProfileEditDiscardDialogExport } from './ProfileEditDiscardDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  Modal: (props: object) => createElement('Modal', props),
  StyleSheet: { create: (styles: object) => styles },
  Text: (props: object) => createElement('Text', props),
  View: (props: object) => createElement('View', props),
});
mockModule(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  useTheme: () => ({
    background: '#fff',
    border: '#ddd',
    card: '#fff',
    text: '#111',
    textSecondary: '#666',
  }),
});
mockModule(new URL('../ui/Button.tsx', import.meta.url), {
  Button: (props: object) => createElement('Button', props),
});

let ProfileEditDiscardDialog: typeof ProfileEditDiscardDialogExport;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ ProfileEditDiscardDialog } = await import('./ProfileEditDiscardDialog'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  mock.restoreAll();
});

test('정확한 안내와 계속 편집, 버리기 action을 제공한다', async () => {
  const onContinue = mock.fn();
  const onDiscard = mock.fn();
  await act(async () => {
    renderer = create(
      createElement(ProfileEditDiscardDialog, { onContinue, onDiscard, visible: true }),
    );
  });
  assert.ok(renderer);

  const texts = renderer.root
    .findAll((node) => (node.type as unknown) === 'Text')
    .map((node) => node.props.children);
  assert.ok(texts.includes('변경사항을 버릴까요?'));
  const dialogs = renderer.root.findAll(
    (node) => (node.type as unknown) === 'Modal' && node.props.role === 'dialog',
  );
  assert.equal(dialogs.length, 1);
  assert.equal(dialogs[0]?.props.accessibilityLabel, '변경사항을 버릴까요?');
  const buttons = renderer.root.findAll((node) => (node.type as unknown) === 'Button');
  assert.deepEqual(
    buttons.map((button) => button.props.children),
    ['계속 편집', '버리기'],
  );

  await act(async () => buttons[0]?.props.onPress());
  await act(async () => buttons[1]?.props.onPress());
  assert.equal(onContinue.mock.callCount(), 1);
  assert.equal(onDiscard.mock.callCount(), 1);
});

test('platform modal 닫기 요청은 계속 편집으로 처리한다', async () => {
  const onContinue = mock.fn();
  await act(async () => {
    renderer = create(
      createElement(ProfileEditDiscardDialog, {
        onContinue,
        onDiscard: () => undefined,
        visible: true,
      }),
    );
  });
  assert.ok(renderer);

  const modal = renderer.root.findAll((node) => (node.type as unknown) === 'Modal')[0];
  assert.ok(modal);
  await act(async () => modal.props.onRequestClose());
  assert.equal(onContinue.mock.callCount(), 1);
});
