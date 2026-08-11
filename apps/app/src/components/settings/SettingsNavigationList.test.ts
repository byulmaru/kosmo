import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { cloneElement, createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactElement } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);

mock.module('expo-router', {
  exports: {
    Link: ({ children, href }: { children: ReactElement; href: string }) =>
      createElement('Link', { href }, cloneElement(children, { href } as never)),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('react-native', {
  exports: {
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
    NavigationLink: ({ children, href }: { children: ReactElement; href: string }) =>
      createElement('NavigationLink', { href }, cloneElement(children, { href } as never)),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  exports: {
    useTheme: () => ({
      divider: '#eeeeee',
      focus: '#005fcc',
      selectedSurface: '#fff8dc',
      text: '#111111',
      textSecondary: '#666666',
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

let SettingsNavigationList: ComponentType<{ selected?: 'default-post-visibility' }>;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ SettingsNavigationList } = await import('./SettingsNavigationList'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('SettingsNavigationList', () => {
  it('승인된 외부 Account와 내부 Profile entry만 이 순서로 제공한다', async () => {
    await render();

    const links = rendered('Pressable');
    assert.equal(links.length, 2);
    assert.equal(
      links[0].props.accessibilityLabel,
      'Byulmaru ID Account Settings 외부 서비스로 이동',
    );
    assert.equal(links[0].props.href, 'https://id.byulmaru.co');
    assert.equal(links[1].props.accessibilityLabel, '게시물 기본 공개 범위 설정 열기');
    assert.equal(links[1].props.href, '/settings/default-post-visibility');
    assert.deepEqual(texts(), ['계정 설정', '게시물 기본 공개 범위']);
  });

  it('full master가 표시한 내부 detail만 current destination으로 전달한다', async () => {
    await render('default-post-visibility');

    const internal = rendered('Pressable')[1];
    assert.equal(internal.props['aria-current'], 'page');
    assert.deepEqual(internal.props.accessibilityState, { selected: true });
    const item = rendered('View').find(
      (node) => node.props.testID === 'settings-default-post-visibility-item',
    );
    assert.ok(item);
    assert.equal(item.props.style.backgroundColor, '#fff8dc');
  });
});

async function render(selected?: 'default-post-visibility') {
  await act(async () => {
    renderer = create(createElement(SettingsNavigationList, { selected }));
  });
  assert.ok(renderer);
}

function rendered(type: string): ReactTestInstance[] {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

function texts(): string[] {
  return rendered('Text').flatMap((node) =>
    typeof node.props.children === 'string' ? [node.props.children] : [],
  );
}
