import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import type { ReactElement, ReactNode } from 'react';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  Platform: { OS: 'web' },
  Pressable: 'Pressable',
  StyleSheet: { create: <T>(styles: T) => styles },
  View: 'View',
});

type TestElementProps = {
  accessibilityLabel?: string;
  accessibilityRole?: string;
  accessibilityState?: { disabled?: boolean; expanded?: boolean };
  children?: ReactNode | ((state: { pressed: boolean }) => ReactNode);
  disabled?: boolean;
  style?: unknown;
};
type TestElement = ReactElement<TestElementProps>;
type IconButtonProps = {
  accessibilityLabel: string;
  accessibilityState?: { expanded?: boolean };
  children: ReactNode;
  disabled?: boolean;
  targetSize?: number;
  visualSize?: number;
};
type IconButtonComponent = (props: IconButtonProps) => TestElement;

let IconButton: IconButtonComponent | undefined;
let getIconButtonTargetSize: ((platform: string) => number) | undefined;

before(async () => {
  const module = await import('./IconButton').catch(() => null);
  IconButton = module?.IconButton as IconButtonComponent | undefined;
  getIconButtonTargetSize = module?.getIconButtonTargetSize as
    | ((platform: string) => number)
    | undefined;
});

function renderIconButton(props: IconButtonProps) {
  assert.ok(IconButton, 'IconButton component must exist');
  return IconButton(props);
}

function findElements(node: ReactNode, type: string): TestElement[] {
  if (!node || typeof node !== 'object' || !('type' in node)) {
    return [];
  }

  const element = node as TestElement;
  const matches = element.type === type ? [element] : [];
  const children =
    typeof element.props.children === 'function'
      ? []
      : Array.isArray(element.props.children)
        ? element.props.children
        : [element.props.children];

  return [...matches, ...children.flatMap((child) => findElements(child, type))];
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!Array.isArray(style)) {
    return typeof style === 'object' && style !== null ? (style as Record<string, unknown>) : {};
  }

  return Object.assign({}, ...style.flat(Infinity).filter(Boolean));
}

test('platform target mapping stays centralized for Web, iOS, and Android', () => {
  assert.ok(getIconButtonTargetSize, 'target size resolver must exist');
  assert.equal(getIconButtonTargetSize('web'), 32);
  assert.equal(getIconButtonTargetSize('ios'), 44);
  assert.equal(getIconButtonTargetSize('android'), 48);
  assert.equal(getIconButtonTargetSize('windows'), 48);
});

test('visual size remains independent from the accessible input target', () => {
  const button = renderIconButton({
    accessibilityLabel: '#공예 제거',
    children: '×',
    targetSize: 44,
    visualSize: 32,
  });
  const targetStyle = flattenStyle(
    (button.props.style as (state: { pressed: boolean }) => unknown)({ pressed: false }),
  );
  const renderedChildren =
    typeof button.props.children === 'function'
      ? button.props.children({ pressed: false })
      : button.props.children;
  const visual = findElements(renderedChildren, 'View')[0];

  assert.equal(button.type, 'Pressable');
  assert.equal(targetStyle.minHeight, 44);
  assert.equal(targetStyle.minWidth, 44);
  assert.ok(visual);
  const visualStyle = flattenStyle(visual.props.style);
  assert.equal(visualStyle.height, 32);
  assert.equal(visualStyle.width, 32);
});

test('button semantics merge the real disabled state with caller accessibility state', () => {
  const button = renderIconButton({
    accessibilityLabel: '프로필 편집 닫기',
    accessibilityState: { expanded: true },
    children: '아이콘',
    disabled: true,
  });
  const disabledStyle = flattenStyle(
    (button.props.style as (state: { pressed: boolean }) => unknown)({ pressed: true }),
  );

  assert.equal(button.props.accessibilityLabel, '프로필 편집 닫기');
  assert.equal(button.props.accessibilityRole, 'button');
  assert.equal(button.props.disabled, true);
  assert.deepEqual(button.props.accessibilityState, { disabled: true, expanded: true });
  assert.equal(disabledStyle.opacity, 0.45);
});
