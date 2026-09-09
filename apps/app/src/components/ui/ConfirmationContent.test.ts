import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import type { ReactElement, ReactNode } from 'react';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('./Button', { Button: 'Button' });
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ foregroundSecondary: 'foreground-secondary' }),
});
mockModule('@/theme/tokens', {
  layoutRecipes: {
    dialogActions: {},
  },
  space: { 8: 8, 12: 12 },
  textStyles: { uiCopyM: { fontSize: 14, lineHeight: 20 } },
});

type TestElementProps = {
  children?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onPress?: (...args: unknown[]) => void;
  tone?: 'danger' | 'primary' | 'secondary';
};
type TestElement = ReactElement<TestElementProps>;
type ConfirmationContentComponent = (props: {
  cancelLabel: string;
  children?: ReactNode;
  confirmDisabled?: boolean;
  confirmLabel: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  pending?: boolean;
  tone?: 'danger' | 'primary';
}) => TestElement;

let ConfirmationContent: ConfirmationContentComponent | undefined;

before(async () => {
  ConfirmationContent = (await import('./ConfirmationContent').catch(() => null))
    ?.ConfirmationContent as ConfirmationContentComponent | undefined;
});

function render(pending = false, tone: 'danger' | 'primary' = 'primary') {
  assert.ok(ConfirmationContent, 'ConfirmationContent component must exist');
  return ConfirmationContent({
    cancelLabel: '취소',
    confirmLabel: '확인',
    message: '계속할까요?',
    onCancel: () => undefined,
    onConfirm: () => undefined,
    pending,
    tone,
  });
}

function findElements(node: ReactNode, type: string): TestElement[] {
  if (!node || typeof node !== 'object' || !('type' in node)) {
    return [];
  }

  const element = node as TestElement;
  const matches = element.type === type ? [element] : [];
  const children = Array.isArray(element.props.children)
    ? element.props.children
    : [element.props.children];
  return [...matches, ...children.flatMap((child) => findElements(child, type))];
}

test('actions keep cancel-confirm order and pending state', () => {
  const buttons = findElements(render(true, 'danger'), 'Button');

  assert.deepEqual(
    buttons.map((button) => button.props.children),
    ['취소', '확인'],
  );
  assert.deepEqual(
    buttons.map(({ props }) => ({
      disabled: props.disabled,
      loading: props.loading,
      tone: props.tone,
    })),
    [
      { disabled: true, loading: undefined, tone: 'secondary' },
      { disabled: undefined, loading: true, tone: 'danger' },
    ],
  );
});

test('confirm can be disabled without changing cancel or loading state', () => {
  assert.ok(ConfirmationContent, 'ConfirmationContent component must exist');
  const buttons = findElements(
    ConfirmationContent({
      cancelLabel: '취소',
      confirmDisabled: true,
      confirmLabel: '확인',
      message: '계속할까요?',
      onCancel: () => undefined,
      onConfirm: () => undefined,
    }),
    'Button',
  );

  assert.deepEqual(
    buttons.map(({ props }) => ({ disabled: props.disabled, loading: props.loading })),
    [
      { disabled: false, loading: undefined },
      { disabled: true, loading: false },
    ],
  );

  const pendingButtons = findElements(
    ConfirmationContent({
      cancelLabel: '취소',
      confirmDisabled: true,
      confirmLabel: '확인',
      message: '계속할까요?',
      onCancel: () => undefined,
      onConfirm: () => undefined,
      pending: true,
    }),
    'Button',
  );

  assert.deepEqual(
    pendingButtons.map(({ props }) => ({ disabled: props.disabled, loading: props.loading })),
    [
      { disabled: true, loading: undefined },
      { disabled: undefined, loading: true },
    ],
  );
});

test('actions do not expose the press event to consumer callbacks', () => {
  assert.ok(ConfirmationContent, 'ConfirmationContent component must exist');
  const cancelCalls: unknown[][] = [];
  const confirmCalls: unknown[][] = [];
  const tree = ConfirmationContent({
    cancelLabel: '취소',
    confirmLabel: '확인',
    message: '계속할까요?',
    onCancel: (...args: unknown[]) => cancelCalls.push(args),
    onConfirm: (...args: unknown[]) => confirmCalls.push(args),
  });
  const [cancelButton, confirmButton] = findElements(tree, 'Button');
  const pressEvent = { type: 'press' };

  cancelButton?.props.onPress?.(pressEvent);
  confirmButton?.props.onPress?.(pressEvent);

  assert.deepEqual(cancelCalls, [[]]);
  assert.deepEqual(confirmCalls, [[]]);
});
