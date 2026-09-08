import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import {
  ConnectionHandler,
  createOperationDescriptor,
  Environment,
  getRequest,
  Network,
  RecordSource,
  Store,
} from 'relay-runtime';
import unfollowMutation from './__generated__/FollowButtonUnfollowProfileMutation.graphql';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { FollowButton as FollowButtonExport } from './FollowButton';
import type { ProfileListItem as ProfileListItemExport } from './ProfileListItem';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: 'web' };
let windowWidth = 1280;
let renderer: ReactTestRenderer | null = null;
type ProfileData = {
  avatar: null;
  bio: null;
  displayName: string;
  followPolicy: 'OPEN';
  followersCount: number;
  handle: string;
  id: string;
  relativeHandle: string;
  viewerState: {
    follow: { follower: { followingCount: number; id: string }; id: string } | null;
    followRequest: null;
    isSelf: boolean;
  };
};
type MutationConfig = { variables: Record<string, unknown> };
const mutationCalls = new Map<string, MutationConfig[]>();

function createProfileData(): ProfileData {
  return {
    avatar: null,
    bio: null,
    displayName: '코스모',
    followPolicy: 'OPEN',
    followersCount: 1,
    handle: 'kosmo',
    id: 'profile-kosmo',
    relativeHandle: '@kosmo',
    viewerState: { follow: null, followRequest: null, isSelf: false },
  };
}

let profileData = createProfileData();

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
  graphql: (parts: TemplateStringsArray) =>
    parts.join('').match(/(?:fragment|mutation)\s+(\w+)/)?.[1] ?? '',
  useFragment: () => profileData,
  useMutation: (operation: string) => [
    (config: MutationConfig) => {
      const calls = mutationCalls.get(operation) ?? [];
      calls.push(config);
      mutationCalls.set(operation, calls);
    },
    false,
  ],
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
  mutationCalls.clear();
  profileData = createProfileData();
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

test('unfollow removes the exact relation from loaded followers and following connections', async () => {
  profileData = {
    ...createProfileData(),
    viewerState: {
      follow: { follower: { followingCount: 3, id: 'profile-viewer' }, id: 'follow-active' },
      followRequest: null,
      isSelf: false,
    },
  };

  await act(async () => {
    renderer = create(createElement(FollowButton, { profile: {} as never }));
  });
  assert.ok(renderer);
  const button = renderer.root.find((node) => (node.type as unknown) === 'Button');

  await act(async () => button.props.onPress());

  assert.deepEqual(mutationCalls.get('FollowButtonUnfollowProfileMutation')?.at(-1)?.variables, {
    connections: [
      ConnectionHandler.getConnectionID('profile-viewer', 'ProfileConnectionList_following'),
      ConnectionHandler.getConnectionID('profile-kosmo', 'ProfileConnectionList_followers'),
    ],
    id: 'profile-kosmo',
  });
});

test('unfollow payload removes the relation edge and record in both connection types', () => {
  const followingConnectionId = ConnectionHandler.getConnectionID(
    'profile-viewer',
    'ProfileConnectionList_following',
  );
  const followersConnectionId = ConnectionHandler.getConnectionID(
    'profile-kosmo',
    'ProfileConnectionList_followers',
  );
  const followingEdgeId = 'following-edge-active';
  const followersEdgeId = 'followers-edge-active';
  const source = new RecordSource();
  source.set(followingConnectionId, {
    __id: followingConnectionId,
    __typename: 'ProfileFollowingConnection',
    edges: { __refs: [followingEdgeId] },
  });
  source.set(followersConnectionId, {
    __id: followersConnectionId,
    __typename: 'ProfileFollowersConnection',
    edges: { __refs: [followersEdgeId] },
  });
  source.set(followingEdgeId, {
    __id: followingEdgeId,
    __typename: 'ProfileFollowingConnectionEdge',
    cursor: 'following-cursor-active',
    node: { __ref: 'follow-active' },
  });
  source.set(followersEdgeId, {
    __id: followersEdgeId,
    __typename: 'ProfileFollowersConnectionEdge',
    cursor: 'followers-cursor-active',
    node: { __ref: 'follow-active' },
  });
  source.set('follow-active', {
    __id: 'follow-active',
    __typename: 'ProfileFollow',
    id: 'follow-active',
  });
  const environment = new Environment({
    network: Network.create(() => Promise.reject(new Error('network is not used'))),
    store: new Store(source),
  });
  const operation = createOperationDescriptor(getRequest(unfollowMutation), {
    connections: [followingConnectionId, followersConnectionId],
    id: 'profile-kosmo',
  });

  environment.commitPayload(operation, {
    unfollowProfile: {
      profileFollowId: 'follow-active',
      followerProfile: { __typename: 'Profile', followingCount: 2, id: 'profile-viewer' },
      followeeProfile: {
        __typename: 'Profile',
        followPolicy: 'OPEN',
        followersCount: 0,
        id: 'profile-kosmo',
        viewerState: { follow: null, followRequest: null, isSelf: false },
      },
    },
  });

  assert.deepEqual(environment.getStore().getSource().get(followingConnectionId)?.edges, {
    __refs: [],
  });
  assert.deepEqual(environment.getStore().getSource().get(followersConnectionId)?.edges, {
    __refs: [],
  });
  assert.equal(environment.getStore().getSource().get('follow-active'), null);
});

for (const [os, width, expectedWidth, marginVertical] of [
  ['web', 767, 96, 0],
  ['web', 768, 72, 0],
  ['web', 1280, 72, 0],
  ['ios', 1280, 96, -2],
  ['android', 1280, 96, -4],
] as const) {
  test(`${os} ${width}px ProfileListItem selects the consumer size without increasing row height`, async () => {
    platform.OS = os;
    windowWidth = width;
    await act(async () => {
      renderer = create(createElement(ProfileListItem, { profile: {} as never }));
    });
    assert.ok(renderer);
    const button = renderer.root.find((node) => (node.type as unknown) === 'Button');
    assert.equal(button.props.style.width, expectedWidth);
    const parentStyle = Object.assign({}, ...button.parent!.props.style.flat());
    assert.equal(parentStyle.marginVertical, marginVertical);
  });
}
