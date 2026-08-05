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
  Pressable: 'Pressable',
  StyleSheet: {
    create: <T>(styles: T) => styles,
    flatten: (style: unknown) => flattenStyle(style),
  },
  View: 'View',
});

type TestElementProps = {
  accessibilityLabel?: string;
  accessibilityRole?: string;
  accessibilityState?: { busy?: boolean; disabled?: boolean; expanded?: boolean };
  children?: ReactNode | ((state: { pressed: boolean }) => ReactNode);
  disabled?: boolean;
  hitSlop?: number | { bottom: number; left: number; right: number; top: number };
  onPressIn?: () => void;
  ref?: unknown;
  style?: unknown;
};
type TestElement = ReactElement<TestElementProps>;
type IconButtonProps = {
  accessibilityLabel: string;
  accessibilityState?: { busy?: boolean; expanded?: boolean };
  children: ReactNode | ((state: { pressed: boolean }) => ReactNode);
  controlRef?: unknown;
  disabled?: boolean;
  feedback?: 'none' | 'opacity';
  hitSlop?: number;
  onPressIn?: () => void;
  style?: unknown;
  targetSize?: number;
  visualSize?: number;
  visualStyle?: unknown;
};
type IconButtonComponent = (props: IconButtonProps) => TestElement;

let IconButton: IconButtonComponent | undefined;
let getIconButtonHitSlop:
  | ((renderedTargetSize: number, effectiveTargetSize: number) => number)
  | undefined;
let getIconButtonOverlayGeometry:
  | ((
      platform: string,
      visualSize: number,
      visualInset: number,
    ) => { targetInset: number; targetSize: number; visualInset: number })
  | undefined;
let getIconButtonPlatformGeometry:
  | ((
      platform: string,
      targetSize: number,
      visualSize?: number,
    ) => { minimumHitSlop: number; minimumTargetSize: number })
  | undefined;
let getIconButtonTargetSize: ((platform: string) => number) | undefined;

before(async () => {
  mockPlatform.OS = 'ios';
  try {
    const module = await import('./IconButton').catch(() => null);
    IconButton = module?.IconButton as IconButtonComponent | undefined;
    getIconButtonHitSlop = module?.getIconButtonHitSlop as typeof getIconButtonHitSlop;
    getIconButtonOverlayGeometry = module?.getIconButtonOverlayGeometry as
      | typeof getIconButtonOverlayGeometry
      | undefined;
    getIconButtonPlatformGeometry = module?.getIconButtonPlatformGeometry as
      | typeof getIconButtonPlatformGeometry
      | undefined;
    getIconButtonTargetSize = module?.getIconButtonTargetSize as
      | ((platform: string) => number)
      | undefined;
  } finally {
    mockPlatform.OS = 'web';
  }
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

test('hit slop preserves the requested effective region from the rendered layout box', () => {
  assert.ok(getIconButtonHitSlop, 'hit slop resolver must exist');
  assert.equal(getIconButtonHitSlop(40, 48), 4);
  assert.equal(getIconButtonHitSlop(32, 48), 8);
  assert.equal(getIconButtonHitSlop(48, 44), 0);
});

test('overlay geometry preserves the visual inset while keeping the platform target in bounds', () => {
  assert.ok(getIconButtonOverlayGeometry, 'overlay geometry resolver must exist');
  assert.deepEqual(getIconButtonOverlayGeometry('web', 32, 4), {
    targetInset: 4,
    targetSize: 32,
    visualInset: 0,
  });
  assert.deepEqual(getIconButtonOverlayGeometry('ios', 32, 4), {
    targetInset: 0,
    targetSize: 44,
    visualInset: 4,
  });
  assert.deepEqual(getIconButtonOverlayGeometry('android', 32, 4), {
    targetInset: 0,
    targetSize: 48,
    visualInset: 4,
  });
});

test('Native target expansion preserves the rendered layout while Web keeps an actual element floor', () => {
  assert.ok(getIconButtonPlatformGeometry, 'platform geometry resolver must exist');
  assert.deepEqual(getIconButtonPlatformGeometry('web', 16, 12), {
    minimumHitSlop: 0,
    minimumTargetSize: 32,
  });
  assert.deepEqual(getIconButtonPlatformGeometry('ios', 40, 40), {
    minimumHitSlop: 2,
    minimumTargetSize: 40,
  });
  assert.deepEqual(getIconButtonPlatformGeometry('android', 44, 44), {
    minimumHitSlop: 2,
    minimumTargetSize: 44,
  });
  assert.deepEqual(getIconButtonPlatformGeometry('android', 48, 32), {
    minimumHitSlop: 0,
    minimumTargetSize: 48,
  });
});

test('Native style-only square preserves its layout and moves the platform deficit into hit slop', () => {
  for (const [platform, expectedHitSlop] of [
    ['ios', 2],
    ['android', 4],
  ] as const) {
    mockPlatform.OS = platform;
    try {
      const button = renderIconButton({
        accessibilityLabel: '미디어 추가',
        children: '+',
        style: { height: 40, width: 40 },
      });
      const targetStyle = flattenStyle(
        (button.props.style as (state: { pressed: boolean }) => unknown)({ pressed: false }),
      );

      assert.equal(targetStyle.height, 40);
      assert.equal(targetStyle.width, 40);
      assert.equal(targetStyle.minHeight, 40);
      assert.equal(targetStyle.minWidth, 40);
      assert.deepEqual(button.props.hitSlop, {
        bottom: expectedHitSlop,
        left: expectedHitSlop,
        right: expectedHitSlop,
        top: expectedHitSlop,
      });
    } finally {
      mockPlatform.OS = 'web';
    }
  }
});

test('caller target and style cannot lower the Web interaction floor', () => {
  const button = renderIconButton({
    accessibilityLabel: '검색 지우기',
    children: '×',
    hitSlop: -4,
    style: { height: 12, minHeight: 12, minWidth: 12, width: 12 },
    targetSize: 16,
  });
  const targetStyle = flattenStyle(
    (button.props.style as (state: { pressed: boolean }) => unknown)({ pressed: false }),
  );

  assert.equal(targetStyle.minHeight, 32);
  assert.equal(targetStyle.minWidth, 32);
  assert.equal(button.props.hitSlop, 0);
});

test('caller can preserve an interaction target larger than the platform floor', () => {
  const button = renderIconButton({
    accessibilityLabel: '닫기',
    children: '×',
    targetSize: 56,
  });
  const targetStyle = flattenStyle(
    (button.props.style as (state: { pressed: boolean }) => unknown)({ pressed: false }),
  );

  assert.equal(targetStyle.minHeight, 56);
  assert.equal(targetStyle.minWidth, 56);
});

test('visual size remains independent from the accessible input target', () => {
  const button = renderIconButton({
    accessibilityLabel: '#공예 제거',
    children: '×',
    style: { position: 'absolute' },
    targetSize: 44,
    visualSize: 32,
    visualStyle: ({ pressed }: { pressed: boolean }) => ({
      backgroundColor: pressed ? 'gray' : 'white',
      borderWidth: 1,
    }),
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
  assert.equal(targetStyle.position, 'absolute');
  assert.equal(targetStyle.backgroundColor, undefined);
  assert.ok(visual);
  const visualStyle = flattenStyle(visual.props.style);
  assert.equal(visualStyle.height, 32);
  assert.equal(visualStyle.width, 32);
  assert.equal(visualStyle.backgroundColor, 'white');
  assert.equal(visualStyle.borderWidth, 1);
});

test('button semantics and interaction props are forwarded without losing press state', () => {
  const controlRef = { current: null };
  const onPressIn = () => undefined;
  const button = renderIconButton({
    accessibilityLabel: '프로필 편집 닫기',
    accessibilityState: { busy: true, expanded: true },
    children: ({ pressed }) => (pressed ? '눌림' : '기본'),
    controlRef,
    disabled: true,
    hitSlop: 4,
    onPressIn,
    style: ({ pressed }: { pressed: boolean }) => ({ backgroundColor: pressed ? 'gray' : 'white' }),
  });
  const disabledStyle = flattenStyle(
    (button.props.style as (state: { pressed: boolean }) => unknown)({ pressed: true }),
  );
  const pressedChildren =
    typeof button.props.children === 'function'
      ? button.props.children({ pressed: true })
      : button.props.children;

  assert.equal(button.props.accessibilityLabel, '프로필 편집 닫기');
  assert.equal(button.props.accessibilityRole, 'button');
  assert.equal(button.props.disabled, true);
  assert.deepEqual(button.props.accessibilityState, { busy: true, disabled: true, expanded: true });
  assert.equal(button.props.hitSlop, 4);
  assert.equal(button.props.onPressIn, onPressIn);
  assert.equal(button.props.ref, controlRef);
  assert.equal(disabledStyle.backgroundColor, 'gray');
  assert.equal(pressedChildren, '눌림');
});

test('visual feedback is opt-in and explicit opacity feedback preserves prior states', () => {
  const defaultButton = renderIconButton({
    accessibilityLabel: '닫기',
    children: '×',
    disabled: true,
  });
  const defaultStyle = flattenStyle(
    (defaultButton.props.style as (state: { pressed: boolean }) => unknown)({ pressed: true }),
  );
  const opacityButton = renderIconButton({
    accessibilityLabel: '닫기',
    children: '×',
    disabled: true,
    feedback: 'opacity',
  });
  const opacityStyle = flattenStyle(
    (opacityButton.props.style as (state: { pressed: boolean }) => unknown)({ pressed: true }),
  );

  assert.equal(defaultStyle.opacity, undefined);
  assert.equal(opacityStyle.opacity, 0.45);
});
