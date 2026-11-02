import { expect, fireEvent, mocked, userEvent, waitFor, within } from 'storybook/test';
import { AnalyticsSessionBridge } from '@/analytics/AnalyticsSessionBridge';
import { trackAnalytics } from '@/analytics/client';
import SearchScreen from '@/app/(tabs)/(protected)/search';
import ProfileScreen from '@/components/profile/ProfileScreen';
import { PrimaryNavigationScrollProvider } from '@/components/shell/PrimaryNavigationScrollContext';
import { ShellChromeProvider } from '@/components/shell/ShellChromeContext';
import { Button } from '@/components/ui/Button';
import { SessionProvider } from '@/session/SessionProvider';
import { RouterMockProvider, usePathname, useRouter } from '../../../.storybook/mocks/expo-router';
import { profile, profileWithPosts } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';

const conversionViewerState = {
  blockedBy: false,
  follow: null,
  followRequest: null,
  isSelf: false,
  membership: null,
  profileBlock: null,
  profileMute: null,
};
const target = profileWithPosts([], {
  id: 'conversion-target',
  displayName: '탐색 대상',
  handle: 'conversion',
  relativeHandle: '@conversion',
  viewerState: conversionViewerState,
});
const data = {
  currentSession: {
    id: 'conversion-session',
    selectedProfile: profile({
      id: 'conversion-viewer',
      displayName: '테스트 계정 프로필',
      handle: 'viewer',
      relativeHandle: '@viewer',
      viewerState: { ...conversionViewerState, isSelf: true },
    }),
  },
  me: { id: 'conversion-account', name: '테스트 계정' },
  searchProfiles: {
    edges: [{ cursor: 'one', node: target }],
    pageInfo: { endCursor: 'one', hasNextPage: false },
  },
  profileByHandle: target,
};
const approvalRequiredTarget = profile({ ...target, followPolicy: 'APPROVAL_REQUIRED' });
const approvalRequiredData = {
  ...data,
  profileByHandle: approvalRequiredTarget,
  searchProfiles: {
    ...data.searchProfiles,
    edges: [{ cursor: 'one', node: approvalRequiredTarget }],
  },
};
const follow = {
  id: 'conversion-follow',
  follower: { id: 'conversion-viewer', followingCount: 1 },
};
const followResponse = (request = false) => ({
  followProfile: {
    followeeProfile: {
      ...(request ? approvalRequiredTarget : target),
      viewerState: {
        isSelf: false,
        profileBlock: null,
        follow: request ? null : follow,
        followRequest: request ? { id: 'conversion-request' } : null,
      },
    },
    followerProfile: follow.follower,
    result: {
      __typename: request ? 'ProfileFollowRequest' : 'ProfileFollow',
      id: request ? 'conversion-request' : follow.id,
    },
  },
});

function Routes() {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <>
      <AnalyticsSessionBridge />
      <Button onPress={() => router.push('/search')}>검색으로 돌아가기</Button>
      {pathname.startsWith('/@') ? (
        <ProfileScreen connectionKind={null} handle="conversion" />
      ) : (
        <SearchScreen />
      )}
    </>
  );
}

function SearchConversionFixture({ startPath = '/search' }: { startPath?: string }) {
  return (
    <RouterMockProvider
      params={{ q: 'conversion', tab: 'people', profileHandle: '@conversion' }}
      pathname={startPath}
    >
      <ShellChromeProvider
        navigationDrawerOpen={false}
        openNavigationDrawer={() => undefined}
        openProfileSwitcher={() => undefined}
        registerHomeReselection={() => () => undefined}
        reselectHome={() => undefined}
      >
        <PrimaryNavigationScrollProvider>
          <SessionProvider>
            <Routes />
          </SessionProvider>
        </PrimaryNavigationScrollProvider>
      </ShellChromeProvider>
    </RouterMockProvider>
  );
}

const events = () =>
  mocked(trackAnalytics).mock.calls.filter(([name]) =>
    ['search_result_selected', 'profile_view_succeeded', 'follow_succeeded'].includes(name),
  );
const selectResult = async (element: HTMLElement) => {
  await userEvent.click(await within(element).findByRole('link', { name: /@conversion / }));
};

const meta = {
  title: 'KOSMO/Screens/SearchConversion/Tests',
  component: SearchConversionFixture,
  beforeEach: () => {
    mocked(trackAnalytics).mockReset();
    return () => mocked(trackAnalytics).mockReset();
  },
  parameters: {
    relay: { actorBoundary: true, data, mutationResponse: followResponse() },
    controls: { disable: true },
  },
} satisfies Meta<typeof SearchConversionFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SelectedProfileVisible: Story = {
  parameters: {
    relay: {
      operationResponses: {
        ProfileScreenQuery: { data, delayMs: 300 },
      },
    },
  },
  play: async ({ canvasElement }) => {
    await selectResult(canvasElement);
    expect(events().map(([name]) => name)).toEqual(['search_result_selected']);
    await expect(within(canvasElement).findByText('아직 게시글이 없어요')).resolves.toBeVisible();
    await waitFor(() =>
      expect(events().map(([name]) => name)).toEqual([
        'search_result_selected',
        'profile_view_succeeded',
      ]),
    );
    expect(events()[0]?.[1]).toEqual({ tab: 'people' });
    expect(events()[1]?.[1]).toEqual({});
  },
};

export const DirectProfileHasNoSearchSelection: Story = {
  args: { startPath: '/@conversion' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).findByText('아직 게시글이 없어요')).resolves.toBeVisible();
    await waitFor(() => expect(events()).toEqual([['profile_view_succeeded', {}]]));
  },
};

export const ModifiedSelectionHasNoSearchSelection: Story = {
  play: async ({ canvasElement }) => {
    const link = await within(canvasElement).findByRole('link', { name: /@conversion / });
    fireEvent.click(link, { ctrlKey: true });
    fireEvent.click(link, { metaKey: true });
    fireEvent.click(link, { shiftKey: true });
    expect(events().map(([name]) => name)).not.toContain('search_result_selected');
  },
};

export const ProfileMissing: Story = {
  parameters: {
    relay: {
      operationResponses: {
        ProfileScreenQuery: {
          data: { currentSession: data.currentSession, profileByHandle: null },
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    await selectResult(canvasElement);
    await expect(
      within(canvasElement).findByText('프로필을 찾을 수 없어요'),
    ).resolves.toBeVisible();
    expect(events().map(([name]) => name)).toEqual(['search_result_selected']);
  },
};

export const ProfileFailure: Story = {
  parameters: {
    relay: { operationResponses: { ProfileScreenQuery: { error: 'profile failed' } } },
  },
  play: async ({ canvasElement }) => {
    await selectResult(canvasElement);
    await expect(
      within(canvasElement).findByText('프로필을 불러오지 못했어요'),
    ).resolves.toBeVisible();
    expect(events().map(([name]) => name)).toEqual(['search_result_selected']);
  },
};

export const FollowRequestExcluded: Story = {
  parameters: {
    relay: {
      data: approvalRequiredData,
      mutationResponse: followResponse(true),
    },
  },
  play: async ({ canvasElement }) => {
    await selectResult(canvasElement);
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: '팔로우' }));
    await expect(canvas.findByRole('button', { name: '요청됨' })).resolves.toBeEnabled();
    await waitFor(() => expect(events().map(([name]) => name)).toContain('follow_succeeded'));
    expect(events().find(([name]) => name === 'follow_succeeded')?.[1]).toMatchObject({
      result: 'request',
    });
  },
};

export const FollowRelationshipIncluded: Story = {
  play: async ({ canvasElement }) => {
    await selectResult(canvasElement);
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: '팔로우' }));
    await expect(canvas.findByRole('button', { name: '팔로잉' })).resolves.toBeEnabled();
    await waitFor(() => expect(events().map(([name]) => name)).toContain('follow_succeeded'));
    expect(events().find(([name]) => name === 'follow_succeeded')?.[1]).toMatchObject({
      result: 'follow',
    });
  },
};
