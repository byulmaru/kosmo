import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { cloneElement, createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactElement } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);
let childOnPressBeforeLink: unknown;
const linkOnPress = () => undefined;

mock.module(new URL('../shell/NavigationLink.tsx', import.meta.url), {
  exports: {
    NavigationLink: ({
      children,
      href,
    }: {
      children: ReactElement<{ href?: string; onPress?: () => void; style?: object }>;
      href: string;
    }) => {
      childOnPressBeforeLink = children.props.onPress;
      const mergedStyle = { ...(children.props.style as object) };
      return createElement(
        'NavigationLink',
        { href },
        cloneElement(children, { href, onPress: linkOnPress, style: mergedStyle }),
      );
    },
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
mock.module(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  exports: {
    useTheme: () => ({
      divider: '#eeeeee',
      focus: '#005fcc',
      text: '#111111',
      textSecondary: '#666666',
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

let Entry: ComponentType;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ ByulmaruIdAccountSettingsEntry: Entry } = await import('./ByulmaruIdAccountSettingsEntry'));
});

afterEach(async () => {
  childOnPressBeforeLink = undefined;
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('ByulmaruIdAccountSettingsEntry', () => {
  it('계정 설정 label과 Byulmaru ID 외부 Account Settings link를 제공한다', async () => {
    await render();

    const entry = byTestId('byulmaru-id-account-settings-entry');
    assert.equal(texts().includes('계정 설정'), true);
    assert.equal(entry.props.accessibilityLabel, 'Byulmaru ID Account Settings 외부 서비스로 이동');
    assert.equal(entry.props.accessibilityRole, 'link');
    assert.equal(entry.props.href, 'https://id.byulmaru.co');
    assert.equal(rendered('NavigationLink')[0].props.href, 'https://id.byulmaru.co');
    assert.equal(rendered('ChevronRightIcon').length, 1);
    assert.equal(childOnPressBeforeLink, undefined);
    const item = rendered('View').find(
      (node) => node.props.testID === 'byulmaru-id-account-settings-item',
    );
    assert.ok(item);
    assert.equal(item.props.style.minHeight, 64);
    assert.equal(item.props.style.width, '100%');
  });

  it('focus-visible style과 link target geometry를 유지한다', async () => {
    await render();

    const entry = byTestId('byulmaru-id-account-settings-entry');
    assert.equal(entry.props.style.minHeight, 64);
    assert.equal(entry.props.style.width, '100%');
    assert.equal(entry.props.style.outlineWidth, undefined);

    await act(async () => entry.props.onFocus());
    const focusedEntry = byTestId('byulmaru-id-account-settings-entry');
    assert.equal(focusedEntry.props.style.outlineWidth, 2);
    assert.equal(focusedEntry.props.style.outlineColor, '#005fcc');

    await act(async () => focusedEntry.props.onBlur());
    assert.equal(
      byTestId('byulmaru-id-account-settings-entry').props.style.outlineWidth,
      undefined,
    );
  });
});

async function render() {
  await act(async () => {
    renderer = create(createElement(Entry));
  });
  assert.ok(renderer);
}

function rendered(type: string): ReactTestInstance[] {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

function byTestId(testID: string): ReactTestInstance {
  assert.ok(renderer);
  return renderer.root.findByProps({ testID });
}

function texts(): string[] {
  return rendered('Text').flatMap((node) =>
    typeof node.props.children === 'string' ? [node.props.children] : [],
  );
}
