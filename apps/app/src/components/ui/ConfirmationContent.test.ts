import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import type { ReactElement, ReactNode } from 'react';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

const mockPlatform: { OS: string } = { OS: 'web' };

mockModule('react-native', {
  Platform: mockPlatform,
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('./Button', { Button: 'Button' });
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ foregroundSecondary: 'foreground-secondary' }),
});
mockModule('@/theme/tokens', {
  space: { 8: 8, 12: 12 },
  textStyles: { uiCopyM: { fontSize: 14, lineHeight: 20 } },
});

type TestElementProps = {
  children?: ReactNode;
  disabled?: boolean;
  hitSlop?: { bottom: number; left: number; right: number; top: number };
  loading?: boolean;
  onPress?: (...args: unknown[]) => void;
  style?: unknown;
  tone?: 'danger' | 'primary' | 'secondary';
};
type TestElement = ReactElement<TestElementProps>;
type ConfirmationContentComponent = (props: {
  cancelLabel: string;
  confirmDisabled?: boolean;
  confirmLabel: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  pending?: boolean;
  supportingContent?: ReactNode;
  tone?: 'danger' | 'primary';
}) => TestElement;

let ConfirmationContent: ConfirmationContentComponent | undefined;

before(async () => {
  ConfirmationContent = (await import('./ConfirmationContent').catch(() => null))
    ?.ConfirmationContent as ConfirmationContentComponent | undefined;
});

function render(platform: string, pending = false, tone: 'danger' | 'primary' = 'primary') {
  assert.ok(ConfirmationContent, 'ConfirmationContent component must exist');
  mockPlatform.OS = platform;
  try {
    return ConfirmationContent({
      cancelLabel: '취소',
      confirmLabel: '확인',
      message: '계속할까요?',
      onCancel: () => undefined,
      onConfirm: () => undefined,
      pending,
      tone,
    });
  } finally {
    mockPlatform.OS = 'web';
  }
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

function flattenStyle(style: unknown): Record<string, unknown> {
  return (Array.isArray(style) ? style : [style]).reduce<Record<string, unknown>>(
    (result, entry) =>
      entry && typeof entry === 'object' ? { ...result, ...(entry as object) } : result,
    {},
  );
}

test('actions keep cancel-confirm order and pending state', () => {
  const buttons = findElements(render('web', true, 'danger'), 'Button');

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

test('actions keep 120x40 visual bounds inside each platform target height', () => {
  for (const [platform, targetHeight, verticalInset] of [
    ['web', 40, undefined],
    ['ios', 44, 2],
    ['android', 48, 4],
  ] as const) {
    const tree = render(platform);
    const actionRow = findElements(tree, 'View').find(
      ({ props }) => flattenStyle(props.style).flexDirection === 'row',
    );
    assert.ok(actionRow);
    assert.equal(flattenStyle(actionRow.props.style).minHeight, targetHeight);

    const buttons = findElements(tree, 'Button');
    for (const button of buttons) {
      assert.deepEqual(flattenStyle(button.props.style), { height: 40, width: 120 });
      assert.deepEqual(
        button.props.hitSlop,
        verticalInset
          ? { bottom: verticalInset, left: 0, right: 0, top: verticalInset }
          : undefined,
      );
    }
  }
});
