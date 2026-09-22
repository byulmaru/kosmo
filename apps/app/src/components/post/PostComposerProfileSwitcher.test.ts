import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement, forwardRef, useImperativeHandle } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PostComposerProfileSwitcher as PostComposerProfileSwitcherComponent } from './PostComposerProfileSwitcher';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: 'ios' };
let triggerFocusCount = 0;
let renderer: ReactTestRenderer | null = null;
let PostComposerProfileSwitcher: typeof PostComposerProfileSwitcherComponent;

const profiles = [
  { avatar: null, displayName: '프로필 A', id: 'profile-a', relativeHandle: '@profile-a' },
  { avatar: null, displayName: '프로필 B', id: 'profile-b', relativeHandle: '@profile-b' },
];

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  Platform: platform,
  Pressable: forwardRef(
    (
      props: {
        children?: unknown;
        [key: string]: unknown;
      },
      ref,
    ) => {
      useImperativeHandle(ref, () => ({ focus: () => triggerFocusCount++ }));
      const children =
        typeof props.children === 'function'
          ? (props.children as (state: { pressed: boolean }) => unknown)({ pressed: false })
          : props.children;
      return createElement('Pressable', props, children as never);
    },
  ),
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('@/components/profile/ProfilePicker', {
  ProfilePicker: (props: Record<string, unknown>) => createElement('ProfilePicker', props),
});
mockModule('@/components/ui/Avatar', { Avatar: 'Avatar' });
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    card: '#fff',
    danger: '#c00',
    surface: '#eee',
    text: '#111',
    textSecondary: '#666',
  }),
});
mockModule('@/theme/tokens', {
  fontFamilies: { ui: 'ui' },
  spacing: { md: 16, sm: 8 },
  typography: { md: {}, sm: {}, xsm: {} },
});

before(async () => {
  ({ PostComposerProfileSwitcher } = await import('./PostComposerProfileSwitcher'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  triggerFocusCount = 0;
  platform.OS = 'ios';
  mock.restoreAll();
});

const openPicker = async () => {
  const trigger = renderer?.root.findByProps({ accessibilityLabel: '작성 프로필' });
  await act(async () => trigger?.props.onPress());
  await act(async () => undefined);
  return renderer?.root.findByType('ProfilePicker' as never);
};

describe('PostComposerProfileSwitcher focus lifecycle', () => {
  it('selection success invokes editor focus ownership without refocusing the trigger, including same-id selection', async () => {
    let selectionSuccessCount = 0;
    await act(async () => {
      renderer = create(
        createElement(PostComposerProfileSwitcher, {
          onSelectionSuccess: () => selectionSuccessCount++,
          onSelectProfile: () => undefined,
          profiles,
          selectedProfileId: profiles[0]!.id,
          surface: 'rail',
        }),
      );
    });

    let picker = await openPicker();
    await act(async () => {
      picker?.props.onSelect(profiles[1]!.id);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(selectionSuccessCount, 1);
    assert.equal(triggerFocusCount, 0);

    picker = await openPicker();
    await act(async () => {
      picker?.props.onSelect(profiles[1]!.id);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(selectionSuccessCount, 2);
    assert.equal(triggerFocusCount, 0);
  });

  it('Native dismissal restores trigger focus', async () => {
    let dismiss: (() => void) | null = null;
    await act(async () => {
      renderer = create(
        createElement(PostComposerProfileSwitcher, {
          onDismissChange: (nextDismiss: (() => void) | null) => {
            dismiss = nextDismiss;
          },
          onSelectProfile: () => undefined,
          profiles,
          selectedProfileId: profiles[0]!.id,
          surface: 'overlay',
        }),
      );
    });

    await openPicker();
    await act(async () => dismiss?.());
    assert.equal(triggerFocusCount, 1);
  });
});
