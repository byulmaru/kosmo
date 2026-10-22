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
  {
    ' $fragmentSpreads': {
      PostComposerProfileSwitcher_profiles: true,
      PostComposer_profile: true,
    } as const,
    avatar: null,
    displayName: '프로필 A',
    id: 'profile-a',
    relativeHandle: '@profile-a',
  },
  {
    ' $fragmentSpreads': {
      PostComposerProfileSwitcher_profiles: true,
      PostComposer_profile: true,
    } as const,
    avatar: null,
    displayName: '프로필 B',
    id: 'profile-b',
    relativeHandle: '@profile-b',
  },
];

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  Animated: { View: 'AnimatedView' },
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Modal: 'Modal',
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
  StyleSheet: { absoluteFill: {}, create: <T>(styles: T) => styles },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  Text: 'Text',
  View: 'View',
});
mockModule('react-relay', {
  graphql: () => ({}),
  useFragment: (_fragment: unknown, fragmentKey: unknown) => fragmentKey,
});
mockModule('@/components/profile/ProfilePicker', {
  ProfilePicker: (props: Record<string, unknown>) => createElement('ProfilePicker', props),
});
mockModule('react-native-safe-area-context', {
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
});
mockModule('@/theme/useOverlayMotion', {
  useOverlayMotion: (visible: boolean) => ({
    mounted: visible,
    progress: { interpolate: () => 0 },
  }),
});
mockModule('@/components/ui/Avatar', { Avatar: 'Avatar' });
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
    card: '#fff',
    danger: '#c00',
    surface: '#eee',
    overlayScrim: '#0008',
    text: '#111',
    textSecondary: '#666',
  }),
});
mockModule('@/theme/tokens', {
  fontFamilies: { ui: 'ui' },
  spacing: { md: 16, sm: 8 },
  space: { 12: 12, 16: 16 },
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
  const bounds = renderer?.root.findAll(
    (node) => typeof node.type === 'string' && typeof node.props.onLayout === 'function',
  )[0];
  await act(async () => bounds?.props.onLayout({ nativeEvent: { layout: { height: 719 } } }));
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
    assert.equal(selectionSuccessCount, 0);
    await act(async () => renderer?.root.findByType('Modal' as never).props.onDismiss());
    assert.equal(selectionSuccessCount, 1);
    assert.equal(triggerFocusCount, 0);

    picker = await openPicker();
    await act(async () => {
      picker?.props.onSelect(profiles[1]!.id);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => renderer?.root.findByType('Modal' as never).props.onDismiss());
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
    assert.equal(triggerFocusCount, 0);
    await act(async () => renderer?.root.findByType('Modal' as never).props.onDismiss());
    assert.equal(triggerFocusCount, 1);
  });

  it('Native picker background cancels after inside presses preserve the open picker', async () => {
    await act(async () => {
      renderer = create(
        createElement(PostComposerProfileSwitcher, {
          onSelectProfile: () => undefined,
          profiles,
          selectedProfileId: profiles[0]!.id,
          surface: 'overlay',
        }),
      );
    });
    await openPicker();
    const trigger = renderer?.root.findByProps({ accessibilityLabel: '작성 프로필' });
    const bounds = renderer?.root.findAll(
      (node) => typeof node.type === 'string' && typeof node.props.onLayout === 'function',
    )[0];
    await act(async () => bounds?.props.onPress?.());
    assert.equal(trigger?.props.accessibilityState.expanded, false);
    assert.equal(triggerFocusCount, 0);
    await act(async () => renderer?.root.findByType('Modal' as never).props.onDismiss());
    assert.equal(triggerFocusCount, 1);

    await openPicker();
    const inside = renderer?.root.findByProps({ testID: 'post-composer-profile-picker' });
    let stopped = false;
    await act(async () => inside?.props.onPress?.({ stopPropagation: () => (stopped = true) }));
    assert.equal(stopped, true);
    assert.equal(trigger?.props.accessibilityState.expanded, true);
  });

  it('deduplicates refreshed fragment refs by profile id', async () => {
    const refreshedProfileA = {
      ...profiles[0]!,
      ' $fragmentSpreads': {
        PostComposerProfileSwitcher_profiles: true,
        PostComposer_profile: true,
      } as const,
    };
    assert.notEqual(refreshedProfileA, profiles[0]);

    await act(async () => {
      renderer = create(
        createElement(PostComposerProfileSwitcher, {
          onSelectProfile: () => undefined,
          profiles: [profiles[0]!, refreshedProfileA, profiles[1]!],
          selectedProfileId: profiles[0]!.id,
          surface: 'rail',
        }),
      );
    });

    const picker = await openPicker();
    const pickerProfiles = picker?.props.profiles as readonly { id: string }[];
    assert.deepEqual(
      pickerProfiles.map(({ id }) => id),
      ['profile-a', 'profile-b'],
    );
  });
});
