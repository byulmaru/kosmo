import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { ProfileEditScreen as ProfileEditScreenExport } from './ProfileEditScreen';
import type { ProfileEditDraft } from './profileEditState';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

const require = createRequire(import.meta.url);
mockModule('lucide-react-native', { ArrowLeft: 'ArrowLeft' });
mockModule(require.resolve('lucide-react-native'), { ArrowLeft: 'ArrowLeft' });
mockModule('react-native', {
  Platform: { OS: 'ios' },
  ScrollView: (props: object) => createElement('ScrollView', props),
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
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

before(async () => {
  ({ ProfileEditScreen } = await import('./ProfileEditScreen'));
});

test('native profile edit scroll keeps the focused field above the keyboard', async () => {
  const draft: ProfileEditDraft = {
    avatar: { kind: 'current', previewUri: null },
    bio: '',
    displayName: '프로필',
    followPolicy: 'APPROVAL_REQUIRED' as const,
    header: { kind: 'current', previewUri: null },
    tags: [],
  };

  try {
    await act(async () => {
      renderer = create(
        createElement(ProfileEditScreen, {
          initialValue: draft,
          onChange: () => undefined,
          onSubmit: () => undefined,
          value: draft,
        }),
      );
    });

    assert.ok(renderer);
    const scroll = renderer.root.find((node) => (node.type as unknown) === 'ScrollView');
    assert.equal(scroll.props.automaticallyAdjustKeyboardInsets, true);
  } finally {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});
