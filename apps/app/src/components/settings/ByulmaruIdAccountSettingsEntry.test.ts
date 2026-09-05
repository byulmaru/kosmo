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

mock.module('expo-router', {
  exports: {
    Link: ({
      children,
      href,
    }: {
      children: ReactElement<{ href?: string; onPress?: () => void; style?: object }>;
      href: string;
    }) => {
      childOnPressBeforeLink = children.props.onPress;
      return createElement(
        'Link',
        { href },
        cloneElement(children, { href, onPress: linkOnPress }),
      );
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('react-native', {
  exports: {
    Platform: { OS: 'web' },
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
    useReducedMotion: () => false,
    useTheme: () => ({
      divider: '#eeeeee',
      focus: '#005fcc',
      selectedBorder: '#9a7800',
      selectedSurface: '#fff8dc',
      stateHover: '#f4f4f4',
      statePressed: '#e8e8e8',
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
    assert.equal(rendered('Link')[0].props.href, 'https://id.byulmaru.co');
    assert.equal(rendered('ChevronRightIcon').length, 1);
    assert.equal(childOnPressBeforeLink, undefined);
    const entryStyle = flattenStyle(entry.props.style({ hovered: false, pressed: false }));
    assert.equal(entryStyle.minHeight, 64);
    assert.equal(entryStyle.width, '100%');
    assert.equal(entryStyle.borderWidth, 1);
    assert.equal(entryStyle.borderColor, 'transparent');
  });

  it('focus-visible style과 link target geometry를 유지한다', async () => {
    await render();

    const entry = byTestId('byulmaru-id-account-settings-entry');
    let entryStyle = flattenStyle(entry.props.style({ hovered: false, pressed: false }));
    assert.equal(entryStyle.minHeight, 64);
    assert.equal(entryStyle.width, '100%');
    assert.equal(entryStyle.borderWidth, 1);
    assert.equal(entryStyle.borderColor, 'transparent');
    assert.equal(entryStyle.outlineWidth, 0);

    await act(async () =>
      entry.props.onFocus({
        currentTarget: { matches: (selector: string) => selector === ':focus-visible' },
      }),
    );
    const focusedEntry = byTestId('byulmaru-id-account-settings-entry');
    entryStyle = flattenStyle(focusedEntry.props.style({ hovered: false, pressed: false }));
    assert.equal(entryStyle.outlineWidth, 2);
    assert.equal(entryStyle.outlineColor, '#005fcc');

    await act(async () => focusedEntry.props.onPointerDown());
    entryStyle = flattenStyle(
      byTestId('byulmaru-id-account-settings-entry').props.style({
        hovered: false,
        pressed: false,
      }),
    );
    assert.equal(entryStyle.outlineWidth, 0);

    await act(async () => byTestId('byulmaru-id-account-settings-entry').props.onBlur());
    assert.equal(
      flattenStyle(
        byTestId('byulmaru-id-account-settings-entry').props.style({
          hovered: false,
          pressed: false,
        }),
      ).outlineWidth,
      0,
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
  return renderer.root.find(
    (node) => (node.type as unknown) === 'Pressable' && node.props.testID === testID,
  );
}

function texts(): string[] {
  return rendered('Text').flatMap((node) =>
    typeof node.props.children === 'string' ? [node.props.children] : [],
  );
}

function flattenStyle(style: unknown): Record<string, unknown> {
  return Array.isArray(style)
    ? Object.assign({}, ...style.filter(Boolean))
    : (style as Record<string, unknown>);
}
