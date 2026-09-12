import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { FollowButton as FollowButtonExport } from './FollowButton';
import type { ProfileListItem as ProfileListItemExport } from './ProfileListItem';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: 'web' };
let windowWidth = 1280;
let renderer: ReactTestRenderer | null = null;
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  Platform: platform,
  Pressable: 'Pressable',
  StyleSheet: {
    create: <T>(styles: T) => styles,
    flatten: (styles: ReadonlyArray<object | undefined>) => Object.assign({}, ...styles),
  },
  Text: 'Text',
  useWindowDimensions: () => ({ width: windowWidth }),
  View: 'View',
});
mockModule('react-relay', {
  graphql: () => ({}),
  useFragment: () => ({
    avatar: null,
    bio: null,
    displayName: '코스모',
    handle: 'kosmo',
    id: 'profile-kosmo',
    relativeHandle: '@kosmo',
    viewerState: { follow: null, followRequest: null, isSelf: false },
  }),
  useMutation: () => [() => {}, false],
});
mockModule('@/analytics/client', { trackAnalytics: () => {} });
mockModule('@/components/ui/ToastProvider', {
  useToast: () => ({ showToast: () => () => {} }),
});
mockModule('@/session/SessionProvider', {
  useSession: () => ({ selectedProfileId: 'viewer' }),
});
mockModule('@/theme/ThemeProvider', { useTheme: () => ({}) });
mockModule('@/components/ui/Button', { Button: 'Button' });
mockModule('@/components/ui/Avatar', { Avatar: 'Avatar' });
mockModule('@/components/shell/NavigationLink', { NavigationLink: 'NavigationLink' });
mockModule(new URL('./ProfileNameBlock.tsx', import.meta.url), {
  ProfileNameBlock: 'ProfileNameBlock',
});

let FollowButton: typeof FollowButtonExport;
let ProfileListItem: typeof ProfileListItemExport;
before(async () => {
  ({ FollowButton } = await import('./FollowButton'));
  ({ ProfileListItem } = await import('./ProfileListItem'));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
  platform.OS = 'web';
  windowWidth = 1280;
});

for (const size of [undefined, 'compact'] as const) {
  test(`FollowButton ${size ?? 'default'} delegates height to Button and supplies width`, async () => {
    await act(async () => {
      renderer = create(createElement(FollowButton, { profile: {} as never, size }));
    });
    assert.ok(renderer);
    const button = renderer.root.find((node) => (node.type as unknown) === 'Button');
    assert.equal(button.props.size, size === 'compact' ? 'compact' : 'default');
    assert.equal(button.props.style.width, size === 'compact' ? 72 : 96);
    assert.equal(button.props.style.height, undefined);
    assert.equal(button.props.hitSlop, undefined);
  });
}

for (const [os, width, marginVertical] of [
  ['web', 767, 0],
  ['web', 768, 0],
  ['web', 1280, 0],
  ['ios', 1280, -2],
  ['android', 1280, -4],
] as const) {
  test(`${os} ${width}px ProfileListItem uses Medium without increasing row height`, async () => {
    platform.OS = os;
    windowWidth = width;
    await act(async () => {
      renderer = create(createElement(ProfileListItem, { profile: {} as never }));
    });
    assert.ok(renderer);
    const button = renderer.root.find((node) => (node.type as unknown) === 'Button');
    assert.equal(button.props.style.width, 96);
    const parentStyle = Object.assign({}, ...button.parent!.props.style.flat());
    assert.equal(parentStyle.marginVertical, marginVertical);
  });
}
