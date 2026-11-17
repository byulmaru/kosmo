import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { cloneElement, createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactElement } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { SettingsLinkRowProps } from './SettingsLinkRow';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);
let platformOS: 'ios' | 'web' = 'web';
let reducedMotion = false;
const timingCalls: Array<{ duration: number; target: string }> = [];
const pendingAnimations: Array<{ complete: () => void; stopped: boolean }> = [];
const theme = {
  borderSubtle: '#eeeeee',
  foregroundPrimary: '#111111',
  foregroundSecondary: '#666666',
  stateFocusRing: '#005fcc',
  stateSelectedSurface: '#fff8dc',
  stateSelectedBorder: '#9a7800',
  stateHover: '#f4f4f4',
  statePressed: '#e8e8e8',
};

class AnimatedColorMock {
  constructor(public value: string) {}
  setValue(value: string) {
    this.value = value;
  }
  stopAnimation(callback?: () => void) {
    callback?.();
  }
}

mock.module('expo-router', {
  exports: {
    Link: ({
      children,
      href,
      rel,
      target,
    }: {
      children: ReactElement<{ href?: string }>;
      href: string;
      rel?: string;
      target?: string;
    }) => createElement('Link', { href, rel, target }, cloneElement(children, { href })),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('react-native', {
  exports: {
    processColor: () => undefined,
    Animated: {
      Color: AnimatedColorMock,
      createAnimatedComponent: <P>(component: ComponentType<P>) => component,
      timing: (
        value: { setValue: (next: unknown) => void },
        config: { duration: number; toValue: unknown },
      ) => {
        const target =
          config.toValue instanceof AnimatedColorMock ? config.toValue.value : config.toValue;
        const pending = {
          complete: () => value.setValue(target),
          stopped: false,
        };
        pendingAnimations.push(pending);
        return {
          start: () => {
            timingCalls.push({ duration: config.duration, target: String(target) });
          },
          stop: () => {
            pending.stopped = true;
          },
        };
      },
    },
    Easing: { bezier: () => () => 0 },
    Platform: {
      get OS() {
        return platformOS;
      },
    },
    Pressable: 'Pressable',
    StyleSheet: {
      create: <T>(styles: T) => styles,
      flatten: (style: unknown) =>
        Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style,
    },
    Text: 'Text',
    View: 'View',
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(require.resolve('lucide-react-native'), {
  exports: { ChevronRightIcon: 'ChevronRightIcon' },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../shell/NavigationLink.tsx', import.meta.url), {
  exports: {
    NavigationLink: ({
      children,
      href,
      onNavigate,
      primary,
      push,
    }: {
      children: ReactElement<{ href?: string }>;
      href: string;
      onNavigate?: () => void;
      primary?: boolean;
      push?: boolean;
    }) =>
      createElement(
        'NavigationLink',
        { href, onNavigate, primary, push },
        cloneElement(children, { href }),
      ),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  exports: {
    useReducedMotion: () => reducedMotion,
    useThemeMode: () => 'light',
    useTheme: () => theme,
  },
} as unknown as Parameters<typeof mock.module>[1]);
let SettingsLinkRow: ComponentType<SettingsLinkRowProps>;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ SettingsLinkRow } = await import('./SettingsLinkRow'));
});

beforeEach(() => {
  platformOS = 'web';
  reducedMotion = false;
  timingCalls.length = 0;
  pendingAnimations.length = 0;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('SettingsLinkRow', () => {
  it('내부 링크는 현재 페이지에서 aria-current=page를 노출한다', async () => {
    await render({
      accessibilityLabel: '프로필 설정 열기',
      currentPage: true,
      description: '현재 공개 범위',
      href: '/settings/profile',
      label: '프로필 설정',
      primary: true,
      selected: true,
      testID: 'settings-row',
    });

    const row = byTestId('settings-row');
    const navigationLink = rendered('NavigationLink')[0];
    assert.equal(navigationLink.props.href, '/settings/profile');
    assert.equal(navigationLink.props.primary, true);
    assert.equal(navigationLink.props.push, true);
    assert.equal(row.props.href, '/settings/profile');
    assert.equal(row.props.accessibilityRole, 'link');
    assert.equal(row.props.accessibilityLabel, '프로필 설정 열기');
    assert.equal(row.props['aria-current'], 'page');
    assert.deepEqual(row.props.accessibilityState, { selected: true });
    const label = rendered('Text').find((node) => node.children[0] === '프로필 설정');
    const description = rendered('Text').find((node) => node.children[0] === '현재 공개 범위');
    assert.ok(label);
    assert.ok(description);
    const rowStyle = flattenStyle(row.props.style);
    assert.equal(colorValue(rowStyle.backgroundColor), '#fff8dc');
    assert.equal(rowStyle.borderWidth, 1);
    assert.equal(colorValue(rowStyle.borderColor), '#9a7800');
    assert.equal(colorValue(rowStyle.borderBottomColor), '#9a7800');
    assert.equal(rowStyle.minHeight, 64);
    assert.equal(rowStyle.width, '100%');
    const chevronWrapper = rendered('View').find(
      (node) => node.props.accessibilityElementsHidden === true,
    );
    assert.ok(chevronWrapper);
    assert.equal(chevronWrapper.props.pointerEvents, 'none');
  });

  it('선택된 상위 category도 현재 페이지가 아니면 aria-current를 받지 않는다', async () => {
    await render({
      accessibilityLabel: '뮤트 및 차단 설정 열기',
      currentPage: false,
      href: '/settings/mute-and-block',
      label: '뮤트 및 차단',
      selected: true,
      testID: 'selected-parent-settings-row',
    });

    const row = byTestId('selected-parent-settings-row');
    assert.equal(row.props['aria-current'], undefined);
    assert.deepEqual(row.props.accessibilityState, { selected: true });
    const style = flattenStyle(row.props.style);
    assert.equal(colorValue(style.backgroundColor), '#fff8dc');
    assert.equal(colorValue(style.borderColor), '#9a7800');
    assert.equal(colorValue(style.borderBottomColor), '#9a7800');
  });

  it('compact theme link exposes its accessible name and current value', async () => {
    await render({
      accessibilityLabel: '화면 설정 열기, 시스템',
      density: 'compact',
      description: '시스템',
      href: '/settings/theme',
      label: '화면',
      testID: 'compact-theme-row',
    });

    const row = byTestId('compact-theme-row');
    const rowStyle = flattenStyle(row.props.style);
    const value = rendered('Text').find((node) => node.children[0] === '시스템');
    assert.ok(value);
    assert.equal(row.props.accessibilityLabel, '화면 설정 열기, 시스템');
    assert.equal(rowStyle.minHeight, 40);
    assert.equal(rowStyle.borderWidth, 1);
    assert.equal(colorValue(rowStyle.borderColor), 'transparent');
    assert.equal(colorValue(rowStyle.borderBottomColor), '#eeeeee');
    assert.equal(flattenStyle(value.props.style).color, '#666666');
    assert.deepEqual(texts(), ['화면', '시스템']);
  });

  it('외부 링크는 expo Link asChild와 exact href를 사용한다', async () => {
    await render({
      accessibilityLabel: '별마루 ID 계정 설정 외부 서비스로 이동',
      external: true,
      href: 'https://id.byulmaru.co',
      label: '별마루 ID',
      primary: true,
      testID: 'external-settings-row',
    });

    const row = byTestId('external-settings-row');
    assert.equal(rendered('NavigationLink').length, 0);
    assert.equal(rendered('Link')[0].props.href, 'https://id.byulmaru.co');
    assert.equal(row.props.href, 'https://id.byulmaru.co');
    assert.equal(row.props.hrefAttrs, undefined);
    assert.equal(row.props['aria-current'], undefined);
    assert.deepEqual(row.props.accessibilityState, { selected: false });
    assert.deepEqual(texts(), ['별마루 ID']);
  });

  it('내부 링크 활성화를 onNavigate callback으로 노출한다', async () => {
    let navigations = 0;
    await render({
      accessibilityLabel: '설정 열기',
      href: '/settings',
      label: '설정',
      onNavigate: () => navigations++,
    });

    const navigationLink = rendered('NavigationLink')[0];
    navigationLink.props.onNavigate();
    assert.equal(navigations, 1);
  });

  it('외부 링크 활성화를 onNavigate callback으로 노출한다', async () => {
    let navigations = 0;
    await render({
      accessibilityLabel: '외부 설정 열기',
      external: true,
      href: 'https://id.byulmaru.co',
      label: '외부 설정',
      onNavigate: () => navigations++,
      testID: 'external-action-row',
    });

    const row = byTestId('external-action-row');
    row.props.onPress();
    assert.equal(navigations, 1);
  });

  it('외부 링크 target=_blank는 noopener noreferrer를 사용한다', async () => {
    await render({
      accessibilityLabel: '외부 설정 새 탭으로 열기',
      external: true,
      href: 'https://id.byulmaru.co',
      label: '별마루 ID',
      target: '_blank',
      testID: 'external-settings-row-with-target',
    });

    const row = byTestId('external-settings-row-with-target');
    assert.deepEqual(row.props.hrefAttrs, {
      rel: 'noopener noreferrer',
      target: '_blank',
    });
    assert.equal(rendered('Link')[0].props.target, '_blank');
    assert.equal(rendered('Link')[0].props.rel, 'noopener noreferrer');
  });

  for (const selected of [false, true]) {
    it(`row events use pressed > hover > selected background with selected=${selected}`, async () => {
      await render({
        accessibilityLabel: '설정 링크',
        href: '/settings/profile',
        label: '프로필 설정',
        selected,
        testID: 'interaction-settings-row',
      });

      const assertColors = (background: string) => {
        const style = rowStyle('interaction-settings-row');
        assert.equal(colorValue(style.backgroundColor), background);
        assert.equal(colorValue(style.borderColor), selected ? '#9a7800' : 'transparent');
        assert.equal(colorValue(style.borderBottomColor), selected ? '#9a7800' : '#eeeeee');
      };
      assertColors(selected ? '#fff8dc' : 'transparent');

      await interact('interaction-settings-row', 'onHoverIn');
      assertColors('#f4f4f4');
      assert.ok(
        timingCalls.some(({ duration, target }) => duration === 120 && target === '#f4f4f4'),
      );

      await interact('interaction-settings-row', 'onPressIn');
      assertColors('#e8e8e8');
      assert.ok(
        timingCalls.some(({ duration, target }) => duration === 120 && target === '#e8e8e8'),
      );

      await interact('interaction-settings-row', 'onPressOut');
      assertColors('#f4f4f4');
      await interact('interaction-settings-row', 'onPressIn');
      await interact('interaction-settings-row', 'onHoverOut');
      assertColors('#e8e8e8');
      await interact('interaction-settings-row', 'onPressOut');
      assertColors(selected ? '#fff8dc' : 'transparent');
    });
  }

  it('selection animates for 200ms and reduced motion applies colors immediately', async () => {
    await render({
      accessibilityLabel: '설정 링크',
      href: '/settings',
      label: '설정',
      selected: false,
      testID: 'motion-settings-row',
    });

    let style = rowStyle('motion-settings-row');
    assert.equal(style.transitionDuration, undefined);

    await act(async () =>
      renderer?.update(
        createElement(SettingsLinkRow, {
          accessibilityLabel: '설정 링크',
          href: '/settings',
          label: '설정',
          selected: true,
          testID: 'motion-settings-row',
        }),
      ),
    );
    assert.ok(timingCalls.some(({ duration, target }) => duration === 200 && target === '#fff8dc'));
    completePendingAnimations();
    const selectedStyle = rowStyle('motion-settings-row');
    assert.equal(colorValue(selectedStyle.backgroundColor), '#fff8dc');
    assert.equal(selectedStyle.transitionDuration, undefined);

    reducedMotion = true;
    await act(async () =>
      renderer?.update(
        createElement(SettingsLinkRow, {
          accessibilityLabel: '설정 링크',
          href: '/settings',
          label: '설정',
          selected: false,
          testID: 'motion-settings-row',
        }),
      ),
    );
    style = rowStyle('motion-settings-row');
    assert.equal(colorValue(style.backgroundColor), 'transparent');
    assert.equal(colorValue(style.borderColor), 'transparent');
    assert.equal(colorValue(style.borderBottomColor), '#eeeeee');
    assert.equal(style.transitionDuration, undefined);

    await act(async () => byTestId('motion-settings-row').props.onPressIn());
    assert.equal(colorValue(rowStyle('motion-settings-row').backgroundColor), '#e8e8e8');
    await act(async () => byTestId('motion-settings-row').props.onPressOut());
    assert.equal(colorValue(rowStyle('motion-settings-row').backgroundColor), 'transparent');
  });

  it('native row uses press events without hover feedback or CSS transitions', async () => {
    platformOS = 'ios';
    await render({
      accessibilityLabel: '설정 링크',
      href: '/settings',
      label: '설정',
      selected: true,
      testID: 'motion-settings-row',
    });
    const style = rowStyle('motion-settings-row');
    assert.equal(style.transitionDuration, undefined);
    assert.equal(style.transitionProperty, undefined);
    assert.equal(style.transitionTimingFunction, undefined);
    await interact('motion-settings-row', 'onHoverIn');
    assert.equal(colorValue(rowStyle('motion-settings-row').backgroundColor), '#fff8dc');
    await interact('motion-settings-row', 'onPressIn');
    assert.equal(colorValue(rowStyle('motion-settings-row').backgroundColor), '#e8e8e8');
    await interact('motion-settings-row', 'onPressOut');
    assert.equal(colorValue(rowStyle('motion-settings-row').backgroundColor), '#fff8dc');
  });

  it('hover 중 선택 상태가 바뀌어도 border 전이는 양방향 200ms를 유지한다', async () => {
    const props = {
      accessibilityLabel: '설정 링크',
      href: '/settings',
      label: '설정',
      selected: false,
      testID: 'selected-transition-row',
    } satisfies SettingsLinkRowProps;
    await render(props);
    await interact('selected-transition-row', 'onHoverIn');

    timingCalls.length = 0;
    await act(async () => {
      renderer?.update(createElement(SettingsLinkRow, { ...props, selected: true }));
    });
    completePendingAnimations();
    assert.equal(
      timingCalls.some(({ duration, target }) => duration === 200 && target === '#9a7800'),
      true,
    );
    const selectedStyle = rowStyle('selected-transition-row');
    assert.equal(colorValue(selectedStyle.borderColor), '#9a7800');
    assert.equal(colorValue(selectedStyle.borderBottomColor), '#9a7800');

    timingCalls.length = 0;
    await act(async () => {
      renderer?.update(createElement(SettingsLinkRow, { ...props, selected: false }));
    });
    completePendingAnimations();
    assert.equal(
      timingCalls.some(({ duration, target }) => duration === 200 && target === 'transparent'),
      true,
    );
    const finalStyle = rowStyle('selected-transition-row');
    assert.equal(colorValue(finalStyle.borderColor), 'transparent');
    assert.equal(colorValue(finalStyle.borderBottomColor), '#eeeeee');
    assert.equal(colorValue(finalStyle.backgroundColor), '#f4f4f4');
    assert.ok(timingCalls.some(({ duration, target }) => duration === 200 && target === '#eeeeee'));
  });

  it('focus 진입은 진행 중 feedback 전이를 중단하거나 끝점으로 점프시키지 않는다', async () => {
    const props = {
      accessibilityLabel: '설정 링크',
      href: '/settings',
      label: '설정',
      selected: false,
      testID: 'focus-transition-row',
    } satisfies SettingsLinkRowProps;
    await render(props);

    await act(async () => {
      renderer?.update(createElement(SettingsLinkRow, { ...props, selected: true }));
    });
    assert.equal(colorValue(rowStyle('focus-transition-row').backgroundColor), 'transparent');
    assert.equal(colorValue(rowStyle('focus-transition-row').borderColor), 'transparent');
    const row = byTestId('focus-transition-row');

    await act(async () => {
      row.props.onFocus({
        currentTarget: { matches: () => true },
      });
    });

    assert.equal(colorValue(rowStyle('focus-transition-row').backgroundColor), 'transparent');
    assert.equal(colorValue(rowStyle('focus-transition-row').borderColor), 'transparent');

    completePendingAnimations();
    const finalStyle = rowStyle('focus-transition-row');
    assert.equal(colorValue(finalStyle.backgroundColor), '#fff8dc');
    assert.equal(colorValue(finalStyle.borderColor), '#9a7800');
    assert.equal(colorValue(finalStyle.borderBottomColor), '#9a7800');
    assert.equal(flattenStyle(row.props.style).outlineWidth, 2);
  });

  it('Web focus ring은 focus-visible일 때만 표시하고 pointer focus에서는 숨긴다', async () => {
    await render({
      accessibilityLabel: '설정 링크',
      href: '/settings',
      label: '설정',
      testID: 'focus-settings-row',
    });

    const row = byTestId('focus-settings-row');
    assert.equal(flattenStyle(row.props.style).outlineWidth, 0);

    await act(async () =>
      row.props.onFocus({
        currentTarget: { matches: (selector: string) => selector === ':focus-visible' },
      }),
    );
    let focusedStyle = rowStyle('focus-settings-row');
    assert.equal(focusedStyle.outlineWidth, 2);
    assert.equal(focusedStyle.outlineColor, '#005fcc');

    await act(async () => byTestId('focus-settings-row').props.onPointerDown());
    focusedStyle = rowStyle('focus-settings-row');
    assert.equal(focusedStyle.outlineWidth, 0);

    await act(async () =>
      byTestId('focus-settings-row').props.onFocus({
        currentTarget: { matches: () => false },
      }),
    );
    focusedStyle = rowStyle('focus-settings-row');
    assert.equal(focusedStyle.outlineWidth, 0);
  });
});

async function render(props: SettingsLinkRowProps) {
  await act(async () => {
    renderer = create(createElement(SettingsLinkRow, props));
  });
  assert.ok(renderer);
}

function rendered(type: string): ReactTestInstance[] {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

function byTestId(testID: string): ReactTestInstance {
  assert.ok(renderer);
  return renderer.root.find(
    (node) => (node.type as unknown) === 'Pressable' && node.props.testID === testID,
  );
}

function texts(): string[] {
  return rendered('Text').flatMap((node) =>
    typeof node.props.children === 'string' ? [node.props.children] : [],
  );
}

function rowStyle(testID: string): Record<string, unknown> {
  return flattenStyle(byTestId(testID).props.style);
}

async function interact(
  testID: string,
  event: 'onHoverIn' | 'onHoverOut' | 'onPressIn' | 'onPressOut',
) {
  await act(async () => byTestId(testID).props[event]());
  completePendingAnimations();
}

function flattenStyle(style: unknown): Record<string, unknown> {
  return Array.isArray(style)
    ? Object.assign({}, ...style.filter(Boolean))
    : (style as Record<string, unknown>);
}

function colorValue(value: unknown) {
  return value instanceof AnimatedColorMock ? value.value : value;
}

function completePendingAnimations() {
  pendingAnimations.splice(0).forEach((animation) => {
    if (!animation.stopped) {
      animation.complete();
    }
  });
}
