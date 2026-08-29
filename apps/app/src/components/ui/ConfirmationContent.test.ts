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
  tone?: 'danger' | 'primary' | 'secondary';
};
type TestElement = ReactElement<TestElementProps>;
type ConfirmationContentComponent = (props: {
  cancelLabel: string;
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

test('Native expands the 40px visual action height without overlapping adjacent actions', () => {
  for (const [platform, verticalInset] of [
    ['ios', 2],
    ['android', 4],
  ] as const) {
    const buttons = findElements(render(platform), 'Button');
    for (const button of buttons) {
      assert.deepEqual(button.props.hitSlop, {
        bottom: verticalInset,
        left: 0,
        right: 0,
        top: verticalInset,
      });
    }
  }

  for (const button of findElements(render('web'), 'Button')) {
    assert.equal(button.props.hitSlop, undefined);
  }
});
