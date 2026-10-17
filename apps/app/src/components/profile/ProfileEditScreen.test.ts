import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, mock, test } from 'node:test';
import { Component, createElement, createRef } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactNode } from 'react';
import type { Text } from 'react-native';
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
let textFocusCalls = 0;
const safeAreaInsets = { top: 24 };

class TextHost extends Component<Record<string, unknown> & { children?: ReactNode }> {
  focus() {
    textFocusCalls += 1;
  }

  render() {
    return createElement('Text', this.props, this.props.children);
  }
}

mockModule('lucide-react-native', { ArrowLeft: 'ArrowLeft' });
mockModule(require.resolve('lucide-react-native'), { ArrowLeft: 'ArrowLeft' });
mockModule('react-native', {
  Platform: platform,
  Pressable: 'Pressable',
  ScrollView: (props: object) => createElement('ScrollView', props),
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: TextHost,
  View: 'View',
});
mockModule('react-native-safe-area-context', {
  useSafeAreaInsets: () => safeAreaInsets,
});
const theme = {
  backgroundCanvas: '#fff',
  feedbackDangerOnSubtle: '#c00',
  foregroundPrimary: '#111',
};
const tokens = {
  iconSizes: { 24: 24 },
  space: { 16: 16, 24: 24 },
  textStyles: { uiCopyM: {}, uiHeadingM: {} },
};
mockModule('@/theme/ThemeProvider', { useTheme: () => theme });
mockModule('@/theme/tokens', tokens);

mockModule(new URL('../PageHeader.tsx', import.meta.url), {
  PageHeader: ({ children }: { children: ReactNode }) =>
    createElement('PageHeader', null, children),
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
  const props: ProfileEditScreenProps = {
    initialValue: draft,
    onChange: () => undefined,
    value: draft,
    ...overrides,
  };
  await act(async () => {
    renderer = create(createElement(ProfileEditScreen, props));
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
  safeAreaInsets.top = 24;
  textFocusCalls = 0;
});

test('native profile edit scroll keeps the focused field above the keyboard', async () => {
  const screen = await renderScreen();
  const scroll = screen.find((node) => (node.type as unknown) === 'ScrollView');
  assert.equal(scroll.props.automaticallyAdjustKeyboardInsets, true);
});

test('native profile edit keeps its header actions and focus', async () => {
  const headingRef = createRef<Text>();
  const actions: string[] = [];
  const screen = await renderScreen({
    headingRef,
    onBack: () => actions.push('back'),
    onSubmit: (submitted) => {
      assert.equal(submitted, draft);
      actions.push('submit');
    },
  });
  const pageHeader = screen.findByType('PageHeader' as never);

  assert.ok(headingRef.current);
  (headingRef.current as unknown as TextHost).focus();
  assert.equal(textFocusCalls, 1);

  const back = pageHeader.findByProps({ accessibilityLabel: '프로필 편집 닫기' });
  const save = pageHeader.findByProps({ accessibilityLabel: '저장' });
  assert.equal(back.props.disabled, false);
  assert.deepEqual(save.props.accessibilityState, { busy: false, disabled: false });
  await act(async () => back.props.onPress());
  await act(async () => save.props.onPress());
  assert.deepEqual(actions, ['back', 'submit']);
});

test('web profile edit keeps its header content in a sticky, focusable region', async () => {
  platform.OS = 'web';

  const screen = await renderScreen();
  const stickyStyle = flattenStyle(
    screen.findByProps({ testID: 'profile-edit-screen-header-sticky' }).props.style,
  );
  assert.equal(stickyStyle.position, 'sticky');
  assert.equal(stickyStyle.top, 24);

  const heading = screen.findByProps({ accessibilityRole: 'header' });
  assert.equal(heading.props.tabIndex, -1);
});
