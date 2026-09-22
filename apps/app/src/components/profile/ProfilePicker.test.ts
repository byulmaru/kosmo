import assert from 'node:assert/strict';
import { afterEach, before, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { ProfilePicker as ProfilePickerComponent } from './ProfilePicker';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const platform: { OS: 'ios' | 'web' } = { OS: 'ios' };
let renderer: ReactTestRenderer | null = null;
let ProfilePicker: typeof ProfilePickerComponent;
type PressableChildren = ReactNode | ((state: { pressed: boolean }) => ReactNode);

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

function MockPressable({
  children,
  ...props
}: {
  children?: PressableChildren;
  [key: string]: unknown;
}) {
  const renderedChildren = typeof children === 'function' ? children({ pressed: false }) : children;
  return createElement('Pressable', props, renderedChildren);
}

mockModule('react-native', {
  Platform: platform,
  Pressable: MockPressable,
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule(require.resolve('lucide-react-native'), { CheckIcon: 'CheckIcon' });
mockModule('@/components/profile/ProfileSwitcherUnread', {
  ProfileSwitcherUnreadBadge: () => null,
});
mockModule('@/components/ui/Avatar', { Avatar: 'Avatar' });
mockModule('@/theme/ThemeProvider', {
  useElevation: () => ({ floating: {}, overlay: {} }),
  useTheme: () => ({
    border: '#ddd',
    card: '#fff',
    surface: '#eee',
    text: '#111',
    textSecondary: '#666',
  }),
});

before(async () => {
  ({ ProfilePicker } = await import('./ProfilePicker'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  platform.OS = 'ios';
  mock.restoreAll();
});

const profiles = [
  { displayName: 'Profile A', id: 'profile-a', relativeHandle: '@profile-a' },
  { displayName: 'Profile B', id: 'profile-b', relativeHandle: '@profile-b' },
];

async function renderPicker({
  busy = false,
  onSelect = () => undefined,
}: { busy?: boolean; onSelect?: (id: string) => void } = {}) {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  await act(async () => {
    renderer = create(
      createElement(ProfilePicker, {
        busy,
        footer: createElement('View', { testID: 'create-form' }),
        menuFooter: createElement('View', { testID: 'add-profile' }),
        onSelect,
        profiles,
        selectedProfileId: 'profile-a',
        surface: 'drawer',
      }),
    );
  });
  assert.ok(renderer);
}

it('Native ProfilePicker는 목록을 스크롤하고 footer를 scroller 밖에 둔다', async () => {
  let selectedId: string | null = null;
  await renderPicker({ onSelect: (id) => (selectedId = id) });
  assert.ok(renderer);

  const scrollView = renderer.root.findByType('ScrollView' as never);
  const profileB = renderer.root.findByProps({ accessibilityLabel: 'Profile B, @profile-b' });
  await act(async () => profileB.props.onPress());
  assert.equal(selectedId, 'profile-b');

  const addProfile = renderer.root.findByProps({ testID: 'add-profile' });
  const createForm = renderer.root.findByProps({ testID: 'create-form' });
  assert.equal(addProfile.parent, scrollView.parent);
  assert.notEqual(createForm.parent, scrollView.parent);

  await renderPicker({ busy: true });
  const busyProfile = renderer.root.findByProps({ accessibilityLabel: 'Profile B, @profile-b' });
  assert.equal(busyProfile.props.disabled, true);
});
