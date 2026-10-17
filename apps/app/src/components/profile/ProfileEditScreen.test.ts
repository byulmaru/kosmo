import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, mock, test } from 'node:test';
import { Component, createElement, createRef, isValidElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactNode } from 'react';
import type { Text } from 'react-native';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PageHeaderProps } from '../PageHeaderView';
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
let textFocusCalls = 0;

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
  borderDefault: '#ddd',
  borderSubtle: '#ececf0',
  feedbackDangerOnSubtle: '#c00',
  foregroundPrimary: '#111',
};
const tokens = {
  fontFamilies: { ui: 'SUIT' },
  iconSizes: { 24: 24 },
  space: { 16: 16, 24: 24 },
  spacing: { lg: 16 },
  textStyles: { uiCopyM: {}, uiHeadingM: {} },
  typography: { xl: {} },
};
mockModule('@/theme/ThemeProvider', { useTheme: () => theme });
mockModule('@/theme/tokens', tokens);
mockModule(new URL('../BrandLogo.tsx', import.meta.url), { BrandLogo: 'BrandLogo' });
mockModule(new URL('../shell/NavigationLink.tsx', import.meta.url), {
  NavigationLink: 'NavigationLink',
});

type NativeHeaderOptions = { header?: () => ReactNode; headerShown?: boolean };
const setNavigationOptions = mock.fn<(options: NativeHeaderOptions) => void>();
const navigation = { setOptions: setNavigationOptions };
mockModule('expo-router', { useNavigation: () => navigation });
mockModule(new URL('../shell/NavigationDrawerTrigger.tsx', import.meta.url), {
  NavigationDrawerTrigger: 'NavigationDrawerTrigger',
});

let renderPageHeader: (props: PageHeaderProps) => ReactNode;
mockModule(new URL('../PageHeader.tsx', import.meta.url), {
  PageHeader: (props: PageHeaderProps) => renderPageHeader(props),
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
let nativeHeaderRenderer: ReactTestRenderer | null = null;

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

function latestNativeHeaderOptions() {
  return setNavigationOptions.mock.calls.at(-1)?.arguments[0];
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

async function renderNativeHeader() {
  const options = latestNativeHeaderOptions();
  assert.equal(options?.headerShown, true);
  assert.ok(options?.header);
  const headerElement = options.header();
  assert.ok(isValidElement(headerElement));
  await act(async () => {
    nativeHeaderRenderer = create(headerElement);
  });
  assert.ok(nativeHeaderRenderer);
  return nativeHeaderRenderer.root;
}

async function unmountScreen() {
  await act(async () => nativeHeaderRenderer?.unmount());
  nativeHeaderRenderer = null;
  await act(async () => renderer?.unmount());
  renderer = null;
}

before(async () => {
  const [{ PageHeader: NativePageHeader }, { PageHeaderView }] = await Promise.all([
    import('../PageHeader.native'),
    import('../PageHeaderView'),
  ]);
  renderPageHeader = (props) =>
    platform.OS === 'web' ? PageHeaderView(props) : NativePageHeader(props);
  ({ ProfileEditScreen } = await import('./ProfileEditScreen'));
});

afterEach(async () => {
  await unmountScreen();
  platform.OS = 'ios';
  safeAreaInsets.top = 0;
  textFocusCalls = 0;
  setNavigationOptions.mock.resetCalls();
});

test('native profile edit scroll keeps the focused field above the keyboard', async () => {
  const screen = await renderScreen();
  const scroll = screen.find((node) => (node.type as unknown) === 'ScrollView');
  assert.equal(scroll.props.automaticallyAdjustKeyboardInsets, true);
});

test('native custom PageHeader registers the focused actions and applies the inset once', async () => {
  safeAreaInsets.top = 54;
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
  const screenStyle = flattenStyle(
    screen.findByProps({ testID: 'profile-edit-screen' }).props.style,
  );

  assert.equal(screenStyle.paddingTop, undefined);

  const header = await renderNativeHeader();
  const safeAreaWrapper = header
    .findAllByType('View' as never)
    .find((node) => flattenStyle(node.props.style).paddingTop === 54);
  assert.ok(safeAreaWrapper);
  assert.deepEqual(flattenStyle(safeAreaWrapper.props.style), {
    backgroundColor: '#fff',
    paddingTop: 54,
  });

  const sharedFrame = header
    .findAllByType('View' as never)
    .find((node) => flattenStyle(node.props.style).minHeight === 64);
  assert.ok(sharedFrame);
  assert.deepEqual(
    {
      borderBottomWidth: flattenStyle(sharedFrame.props.style).borderBottomWidth,
      borderColor: flattenStyle(sharedFrame.props.style).borderColor,
      minHeight: flattenStyle(sharedFrame.props.style).minHeight,
      paddingHorizontal: flattenStyle(sharedFrame.props.style).paddingHorizontal,
    },
    {
      borderBottomWidth: 1,
      borderColor: '#ececf0',
      minHeight: 64,
      paddingHorizontal: 16,
    },
  );

  const row = header.findByProps({ testID: 'profile-edit-screen-header' });
  const rowStyle = flattenStyle(row.props.style);
  assert.equal(rowStyle.alignSelf, 'stretch');
  assert.equal(rowStyle.flex, 1);
  assert.equal(rowStyle.height, undefined);
  assert.equal(rowStyle.paddingHorizontal, undefined);
  assert.equal(rowStyle.borderBottomWidth, undefined);

  assert.ok(headingRef.current);
  (headingRef.current as unknown as TextHost).focus();
  assert.equal(textFocusCalls, 1);

  const back = header.findByProps({ accessibilityLabel: '프로필 편집 닫기' });
  const save = header.findByProps({ accessibilityLabel: '저장' });
  assert.equal(back.props.disabled, false);
  assert.deepEqual(save.props.accessibilityState, { busy: false, disabled: false });
  await act(async () => back.props.onPress());
  await act(async () => save.props.onPress());
  assert.deepEqual(actions, ['back', 'submit']);
});

test('web profile edit renders the shared inline frame as a sticky header', async () => {
  platform.OS = 'web';
  safeAreaInsets.top = 24;

  const screen = await renderScreen();
  const rootStyle = flattenStyle(screen.findByProps({ testID: 'profile-edit-screen' }).props.style);
  const stickyStyle = flattenStyle(
    screen.findByProps({ testID: 'profile-edit-screen-header-sticky' }).props.style,
  );
  const sharedFrame = screen
    .findAllByType('View' as never)
    .find((node) => flattenStyle(node.props.style).minHeight === 64);
  assert.ok(sharedFrame);

  assert.equal(rootStyle.paddingTop, undefined);
  assert.equal(stickyStyle.position, 'sticky');
  assert.equal(stickyStyle.top, 0);
  assert.equal(flattenStyle(sharedFrame.props.style).minHeight, 64);
  assert.equal(flattenStyle(sharedFrame.props.style).borderBottomWidth, 1);
  assert.equal(flattenStyle(sharedFrame.props.style).borderColor, '#ececf0');

  const heading = screen.findByProps({ accessibilityRole: 'header' });
  assert.equal(heading.props.tabIndex, -1);
});
