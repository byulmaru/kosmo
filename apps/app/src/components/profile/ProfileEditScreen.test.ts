import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type {
  ProfileEditScreen as ProfileEditScreenExport,
  ProfileEditScreenProps,
} from './ProfileEditScreen';
import type { ProfileEditDraft } from './profileEditState';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

const require = createRequire(import.meta.url);
const platform = { OS: 'ios' };
const safeAreaInsets = { top: 0 };
mockModule('lucide-react-native', { ArrowLeft: 'ArrowLeft' });
mockModule(require.resolve('lucide-react-native'), { ArrowLeft: 'ArrowLeft' });
mockModule('react-native', {
  Platform: platform,
  ScrollView: (props: object) => createElement('ScrollView', props),
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('react-native-safe-area-context', {
  useSafeAreaInsets: () => safeAreaInsets,
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    backgroundCanvas: '#fff',
    borderDefault: '#ddd',
    feedbackDangerOnSubtle: '#c00',
    foregroundPrimary: '#111',
  }),
});
mockModule('@/theme/tokens', {
  iconSizes: { 24: 24 },
  space: { 16: 16, 24: 24 },
  textStyles: { uiCopyM: {}, uiHeadingM: {} },
});
mockModule('../ui/Button', {
  Button: (props: object) => createElement('Button', props),
});
mockModule('../ui/IconButton', {
  IconButton: (props: object) => createElement('IconButton', props),
});
mockModule('./ProfileEditForm', {
  ProfileEditForm: () => createElement('ProfileEditForm'),
});
mockModule('./profileEditState', {
  canSubmitProfileEdit: () => true,
  validateProfileEditDraft: () => ({}),
});

let ProfileEditScreen: typeof ProfileEditScreenExport;
let renderer: ReactTestRenderer | null = null;

const draft: ProfileEditDraft = {
  avatar: { kind: 'current', previewUri: null },
  bio: '',
  displayName: '프로필',
  header: { kind: 'current', previewUri: null },
  tags: [],
};

function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.map(flattenStyle));
  }
  return style && typeof style === 'object' ? (style as Record<string, unknown>) : {};
}

async function renderScreen(overrides: Partial<ProfileEditScreenProps> = {}) {
  await act(async () => {
    renderer = create(
      createElement(ProfileEditScreen, {
        ...overrides,
        initialValue: overrides.initialValue ?? draft,
        onChange: overrides.onChange ?? (() => undefined),
        value: overrides.value ?? draft,
      }),
    );
  });
  assert.ok(renderer);
  return renderer.root;
}

async function unmountScreen() {
  await act(async () => renderer?.unmount());
  renderer = null;
}

before(async () => {
  ({ ProfileEditScreen } = await import('./ProfileEditScreen'));
});

afterEach(async () => {
  await unmountScreen();
  platform.OS = 'ios';
  safeAreaInsets.top = 0;
});

test('native profile edit scroll keeps the focused field above the keyboard', async () => {
  const screen = await renderScreen({ onSubmit: () => undefined });
  const scroll = screen.find((node) => (node.type as unknown) === 'ScrollView');
  assert.equal(scroll.props.automaticallyAdjustKeyboardInsets, true);
});

test('native profile edit header stays below the safe area without changing its content height', async () => {
  for (const [os, top] of [
    ['ios', 54],
    ['android', 24],
    ['android', 0],
  ] as const) {
    platform.OS = os;
    safeAreaInsets.top = top;

    const screen = await renderScreen();
    const rootStyle = flattenStyle(
      screen.findByProps({ testID: 'profile-edit-screen' }).props.style,
    );
    const headerStyle = flattenStyle(
      screen.findByProps({ testID: 'profile-edit-screen-header' }).props.style,
    );

    assert.equal(rootStyle.paddingTop ?? 0, top);
    assert.equal(headerStyle.height, 64);
    await unmountScreen();
  }
});

test('web profile edit keeps shell-owned safe area and its sticky 64px header', async () => {
  platform.OS = 'web';
  safeAreaInsets.top = 24;

  const screen = await renderScreen();
  const rootStyle = flattenStyle(screen.findByProps({ testID: 'profile-edit-screen' }).props.style);
  const headerStyle = flattenStyle(
    screen.findByProps({ testID: 'profile-edit-screen-header' }).props.style,
  );

  assert.equal(rootStyle.paddingTop, undefined);
  assert.equal(headerStyle.height, 64);
  assert.equal(headerStyle.position, 'sticky');
  assert.equal(headerStyle.top, 0);
});
