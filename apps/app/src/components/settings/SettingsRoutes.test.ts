import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);

let platform: 'android' | 'ios' | 'web' = 'web';
let width = 1_280;
let backCalls = 0;
let canGoBack = true;
let replacedPaths: string[] = [];
let pathname = '/settings';
let SlotRoute: ComponentType = () => null;

mock.module('expo-router', {
  exports: {
    Slot: () => createElement(SlotRoute),
    usePathname: () => pathname,
    useRouter: () => ({
      back: () => (backCalls += 1),
      canGoBack: () => canGoBack,
      replace: (href: string) => replacedPaths.push(href),
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('react-native', {
  exports: {
    Platform: {
      get OS() {
        return platform;
      },
    },
    Pressable: ({ children, ...props }: Record<string, unknown>) =>
      createElement(
        'Pressable',
        props,
        typeof children === 'function' ? children({ pressed: false }) : (children as ReactNode),
      ),
    ScrollView: ({ children, ...props }: Record<string, unknown>) =>
      createElement('ScrollView', props, children as ReactNode),
    StyleSheet: { create: <T>(styles: T) => styles, flatten: flattenStyle },
    useWindowDimensions: () => ({ width }),
    View: 'View',
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(require.resolve('lucide-react-native'), {
  exports: { ChevronLeftIcon: 'ChevronLeftIcon' },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../PageHeader.tsx', import.meta.url), {
  exports: {
    PageHeader: (props: Record<string, unknown>) =>
      createElement('PageHeader', props, props.leading as ReactNode),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('./SettingsNavigationList.tsx', import.meta.url), {
  exports: {
    SettingsNavigationList: (props: Record<string, unknown>) =>
      createElement('SettingsNavigationList', props),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('./SettingsProfileDetail.tsx', import.meta.url), {
  exports: {
    SettingsProfileDetail: () => createElement('SettingsProfileDetail'),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  exports: { useTheme: () => ({ border: '#333333', text: '#111111' }) },
} as unknown as Parameters<typeof mock.module>[1]);

let SettingsDefaultPostVisibilityRoute: ComponentType;
let SettingsLayout: ComponentType;
let SettingsRoute: ComponentType;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ default: SettingsLayout } = await import('../../app/(tabs)/(protected)/settings/_layout'));
  ({ default: SettingsRoute } = await import('../../app/(tabs)/(protected)/settings/index'));
  ({ default: SettingsDefaultPostVisibilityRoute } =
    await import('../../app/(tabs)/(protected)/settings/default-post-visibility'));
});

afterEach(async () => {
  platform = 'web';
  width = 1_280;
  backCalls = 0;
  canGoBack = true;
  replacedPaths = [];
  pathname = '/settings';
  SlotRoute = () => null;
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('Settings routes', () => {
  it('full Web root는 320px master와 flexible Profile detail을 함께 표시한다', async () => {
    await renderRoute('/settings', SettingsRoute);

    const workspace = byTestId('settings-workspace');
    assert.equal(workspace.props.style.flexDirection, 'row');
    assert.equal(flattenStyle(byTestId('settings-master-pane').props.style).width, 320);
    assert.equal(byTestId('settings-detail-pane').props.style.flex, 1);
    assert.deepEqual(
      rendered('PageHeader').map((node) => node.props.title),
      ['설정', '게시물 기본 공개 범위'],
    );
    assert.equal(rendered('SettingsNavigationList')[0].props.selected, 'default-post-visibility');
    assert.equal(rendered('SettingsProfileDetail').length, 1);
  });

  it('full Web detail은 공통 master와 back action 없는 detail heading을 표시한다', async () => {
    await renderRoute('/settings/default-post-visibility', SettingsDefaultPostVisibilityRoute);

    assert.ok(byTestId('settings-workspace'));
    assert.deepEqual(
      rendered('PageHeader').map((node) => node.props.title),
      ['설정', '게시물 기본 공개 범위'],
    );
    assert.equal(rendered('SettingsNavigationList')[0].props.selected, 'default-post-visibility');
    assert.equal(rendered('Pressable').length, 0);
    assert.equal(rendered('SettingsProfileDetail').length, 1);
  });

  it('compact Web root는 선택 없는 root 목록부터 표시한다', async () => {
    width = 768;
    await renderRoute('/settings', SettingsRoute);

    assert.equal(rendered('PageHeader')[0].props.title, '설정');
    assert.equal(rendered('SettingsNavigationList')[0].props.selected, undefined);
    assert.equal(rendered('SettingsProfileDetail').length, 0);
  });

  it('mobile Web은 shell header를 중복하지 않고 root와 detail을 한 화면씩 표시한다', async () => {
    width = 390;
    await renderRoute('/settings', SettingsRoute);
    assert.equal(rendered('PageHeader').length, 0);
    assert.equal(rendered('SettingsNavigationList').length, 1);

    await rerenderRoute('/settings/default-post-visibility', SettingsDefaultPostVisibilityRoute);
    assert.equal(rendered('PageHeader').length, 0);
    assert.equal(rendered('SettingsNavigationList').length, 0);
    assert.equal(rendered('SettingsProfileDetail').length, 1);
    assert.equal(rendered('ScrollView').length, 0);
  });

  it('Native detail은 header부터 content까지 하나의 vertical ScrollView가 소유한다', async () => {
    platform = 'android';
    width = 320;
    await renderRoute('/settings/default-post-visibility', SettingsDefaultPostVisibilityRoute);

    const scrollView = rendered('ScrollView')[0];
    assert.ok(scrollView);
    assert.equal(scrollView.findAll((node) => (node.type as unknown) === 'PageHeader').length, 1);
    assert.equal(
      scrollView.findAll((node) => (node.type as unknown) === 'SettingsProfileDetail').length,
      1,
    );
  });

  it('compact Web detail은 unrelated history가 있어도 route-owned back header로 root를 연다', async () => {
    width = 768;
    await renderRoute('/settings/default-post-visibility', SettingsDefaultPostVisibilityRoute);

    const header = rendered('PageHeader')[0];
    assert.equal(header.props.title, '게시물 기본 공개 범위');
    const back = header.props.leading;
    assert.equal(back.props.accessibilityLabel, '설정으로 돌아가기');
    await act(async () => back.props.onPress());
    assert.equal(backCalls, 0);
    assert.deepEqual(replacedPaths, ['/settings']);
  });

  it('direct detail entry에 history가 없으면 Settings root로 대체한다', async () => {
    width = 768;
    canGoBack = false;
    await renderRoute('/settings/default-post-visibility', SettingsDefaultPostVisibilityRoute);

    const back = rendered('PageHeader')[0].props.leading;
    await act(async () => back.props.onPress());

    assert.equal(backCalls, 0);
    assert.deepEqual(replacedPaths, ['/settings']);
  });

  it('Android detail back action은 44dp layout과 hit slop으로 48dp target을 제공한다', async () => {
    platform = 'android';
    await renderRoute('/settings/default-post-visibility', SettingsDefaultPostVisibilityRoute);

    const back = rendered('Pressable').find(
      (node) => node.props.accessibilityLabel === '설정으로 돌아가기',
    );
    assert.ok(back);
    const resolvedStyle =
      typeof back.props.style === 'function'
        ? back.props.style({ pressed: false })
        : back.props.style;
    const style = flattenStyle(resolvedStyle);
    assert.equal(style.height, 44);
    assert.equal(style.minHeight, 44);
    assert.equal(style.minWidth, 44);
    assert.equal(style.width, 44);
    assert.deepEqual(back.props.hitSlop, { bottom: 2, left: 2, right: 2, top: 2 });
  });

  it('Native root는 route-owned 설정 heading을 표시한다', async () => {
    platform = 'ios';
    width = 1_024;
    await renderRoute('/settings', SettingsRoute);

    assert.equal(rendered('PageHeader')[0].props.title, '설정');
    assert.equal(rendered('SettingsNavigationList').length, 1);
  });
});

async function renderRoute(nextPathname: string, Route: ComponentType) {
  pathname = nextPathname;
  SlotRoute = Route;
  await act(async () => {
    renderer = create(createElement(SettingsLayout));
  });
  assert.ok(renderer);
}

async function rerenderRoute(nextPathname: string, Route: ComponentType) {
  assert.ok(renderer);
  pathname = nextPathname;
  SlotRoute = Route;
  await act(async () => renderer?.update(createElement(SettingsLayout)));
}

function rendered(type: string): ReactTestInstance[] {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

function byTestId(testID: string): ReactTestInstance {
  assert.ok(renderer);
  return renderer.root.find(
    (node) => (node.type as unknown) === 'View' && node.props.testID === testID,
  );
}

function flattenStyle(style: unknown): Record<string, unknown> {
  return Array.isArray(style)
    ? Object.assign({}, ...style.filter(Boolean))
    : (style as Record<string, unknown>);
}
