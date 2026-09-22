import { Text } from 'react-native';
import { expect, fireEvent, mocked, userEvent, waitFor, within } from 'storybook/test';
import { AnalyticsSessionBridge } from '@/analytics/AnalyticsSessionBridge';
import { captureSearchProfileAnalytics, observeAnalyticsSession } from '@/analytics/client';
import { searchProfileJourneys } from '@/analytics/searchProfileJourneys';
import ProfileLayout from '@/app/(tabs)/(profile)/[profileHandle]/_layout';
import SearchScreen from '@/app/(tabs)/(protected)/search';
import { useProfileRoute } from '@/components/profile/ProfileRouteShell';
import { PrimaryNavigationScrollProvider } from '@/components/shell/PrimaryNavigationScrollContext';
import { ShellChromeProvider } from '@/components/shell/ShellChromeContext';
import { Button } from '@/components/ui/Button';
import { SessionProvider } from '@/session/SessionProvider';
import { RouterMockProvider, usePathname, useRouter } from '../../../.storybook/mocks/expo-router';
import { profile } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';

const target = profile({
  id: 'conversion-target',
  displayName: '탐색 대상',
  handle: 'conversion',
  relativeHandle: '@conversion',
});
const data = {
  currentSession: { id: 'conversion-session', selectedProfile: { id: 'conversion-viewer' } },
  me: { id: 'conversion-account', name: '테스트 계정' },
  searchProfiles: {
    edges: [{ cursor: 'one', node: target }],
    pageInfo: { endCursor: 'one', hasNextPage: false },
  },
  profileByHandle: target,
};
const follow = {
  id: 'conversion-follow',
  follower: { id: 'conversion-viewer', followingCount: 1 },
};
const followResponse = (request = false) => ({
  followProfile: {
    followeeProfile: {
      ...target,
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

// Expo's Slot boundary is replaced, while the production layout constructs and mounts its chrome.
function ProfileContent() {
  const { chrome } = useProfileRoute();
  return (
    <>
      {chrome}
      <Text>프로필 콘텐츠</Text>
    </>
  );
}

function Routes() {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <>
      <AnalyticsSessionBridge />
      <Button onPress={() => router.push('/search')}>검색으로 돌아가기</Button>
      {pathname.startsWith('/@') ? <ProfileLayout /> : <SearchScreen />}
    </>
  );
}

function SearchConversionFixture({ startPath = '/search' }: { startPath?: string }) {
  return (
    <RouterMockProvider
      params={{ q: 'conversion', tab: 'people', profileHandle: '@conversion' }}
      pathname={startPath}
      slot={<ProfileContent />}
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

const emissions = () => mocked(captureSearchProfileAnalytics).mock.calls.map(([args]) => args);
const successes = () => emissions().filter(([event]) => event.endsWith('_succeeded'));
const selectResult = async (element: HTMLElement) => {
  await userEvent.click(await within(element).findByRole('link', { name: /@conversion / }));
};

const meta = {
  title: 'KOSMO/Screens/SearchConversion/Tests',
  component: SearchConversionFixture,
  beforeEach: () => {
    searchProfileJourneys.setSearch('reset-story');
    mocked(captureSearchProfileAnalytics).mockReset().mockReturnValue('conversion-sdk-session');
    mocked(observeAnalyticsSession).mockImplementation((listener) => {
      listener('conversion-sdk-session');
      return () => undefined;
    });
    return () => {
      searchProfileJourneys.end();
      mocked(captureSearchProfileAnalytics).mockReset();
      mocked(observeAnalyticsSession).mockReset();
    };
  },
  parameters: {
    relay: { data, mutationResponse: followResponse() },
    controls: { disable: true },
  },
} satisfies Meta<typeof SearchConversionFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ViewFollowAndReselect: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await selectResult(canvasElement);
    await expect(canvas.findByText('프로필 콘텐츠')).resolves.toBeVisible();
    await waitFor(() =>
      expect(successes().map(([event]) => event)).toEqual(['search_profile_view_succeeded']),
    );
    await userEvent.click(canvas.getByRole('button', { name: '팔로우' }));
    await expect(canvas.findByRole('button', { name: '팔로잉' })).resolves.toBeEnabled();
    await userEvent.click(canvas.getByRole('button', { name: '검색으로 돌아가기' }));
    await selectResult(canvasElement);
    await expect(canvas.findByText('프로필 콘텐츠')).resolves.toBeVisible();
    expect(emissions().map(([event]) => event)).toEqual([
      'search_profile_journey_started',
      'search_profile_view_succeeded',
      'search_profile_follow_succeeded',
    ]);
    expect(new Set(emissions().map(([, props]) => props.search_profile_journey_id)).size).toBe(1);
    for (const [event, props] of emissions()) {
      expect(Object.keys(props).sort()).toEqual(
        event.endsWith('_started')
          ? ['search_profile_journey_id', 'source']
          : ['elapsed_ms', 'search_profile_journey_id', 'source'],
      );
      expect(props.search_profile_journey_id).toMatch(/^[0-9a-f-]{36}$/);
    }
  },
};

export const FollowWithoutSelection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: '팔로우' }));
    await expect(canvas.findByRole('button', { name: '팔로잉' })).resolves.toBeEnabled();
    expect(emissions()).toEqual([]);
  },
};

export const ModifierSelection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = await canvas.findByRole('link', { name: /@conversion / });
    fireEvent.click(link, { ctrlKey: true });
    expect(link).toBeVisible();
    expect(emissions()).toEqual([]);
    fireEvent.click(link, { metaKey: true });
    expect(emissions()).toEqual([]);
  },
};

export const PendingIsNotSuccess: Story = {
  parameters: { relay: { mutationLoading: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await selectResult(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: '팔로우' }));
    await expect(canvas.findByRole('button', { name: '팔로잉' })).resolves.toBeDisabled();
    expect(successes().map(([event]) => event)).toEqual(['search_profile_view_succeeded']);
  },
};

export const RequestIsNotSuccess: Story = {
  parameters: { relay: { mutationResponse: followResponse(true) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await selectResult(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: '팔로우' }));
    await expect(canvas.findByRole('button', { name: '요청됨' })).resolves.toBeEnabled();
    expect(successes().map(([event]) => event)).toEqual(['search_profile_view_succeeded']);
  },
};

export const FollowFailure: Story = {
  parameters: { relay: { mutationGraphQLErrors: ['follow failed'] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await selectResult(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: '팔로우' }));
    await expect(
      within(canvasElement.ownerDocument.body).findByRole('alert'),
    ).resolves.toHaveTextContent('팔로우 상태를 변경하지 못했습니다.');
    expect(successes().map(([event]) => event)).toEqual(['search_profile_view_succeeded']);
  },
};

export const PagehideBeforeFollowResponse: Story = {
  parameters: {
    relay: {
      operationResponses: {
        FollowButtonFollowProfileMutation: { data: followResponse(), delayMs: 300 },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await selectResult(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: '팔로우' }));
    window.dispatchEvent(new Event('pagehide'));
    await waitFor(() => expect(canvas.getByRole('button', { name: '팔로잉' })).toBeEnabled());
    expect(successes().map(([event]) => event)).toEqual(['search_profile_view_succeeded']);
  },
};

export const ProfileLoadingThenVisible: Story = {
  parameters: {
    relay: {
      operationResponses: {
        ProfileLayoutQuery: { data: { profileByHandle: target }, delayMs: 300 },
      },
    },
  },
  play: async ({ canvasElement }) => {
    await selectResult(canvasElement);
    expect(successes()).toEqual([]);
    await expect(within(canvasElement).findByText('프로필 콘텐츠')).resolves.toBeVisible();
    await waitFor(() => expect(successes().length).toBe(1));
  },
};

export const ProfileMissing: Story = {
  parameters: {
    relay: {
      operationResponses: {
        ProfileLayoutQuery: { data: { profileByHandle: null } },
      },
    },
  },
  play: async ({ canvasElement }) => {
    await selectResult(canvasElement);
    await expect(
      within(canvasElement).findByText('프로필을 찾을 수 없어요'),
    ).resolves.toBeVisible();
    expect(successes()).toEqual([]);
  },
};

export const ProfileFailure: Story = {
  parameters: {
    relay: { operationResponses: { ProfileLayoutQuery: { error: 'profile failed' } } },
  },
  play: async ({ canvasElement }) => {
    await selectResult(canvasElement);
    await expect(
      within(canvasElement).findByText('프로필을 불러오지 못했어요'),
    ).resolves.toBeVisible();
    expect(successes()).toEqual([]);
  },
};

export const DirectProfileHasNoJourney: Story = {
  args: { startPath: '/@conversion' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).findByText('프로필 콘텐츠')).resolves.toBeVisible();
    expect(emissions()).toEqual([]);
  },
};

export const NewSearchBeforeFollowResponse: Story = {
  parameters: {
    relay: {
      operationResponses: {
        FollowButtonFollowProfileMutation: { data: followResponse(), delayMs: 800 },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await selectResult(canvasElement);
    await expect(canvas.findByText('프로필 콘텐츠')).resolves.toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '검색으로 돌아가기' }));
    await userEvent.click(await canvas.findByRole('button', { name: '팔로우' }));
    const input = canvas.getByRole('textbox', { name: '검색어' });
    await userEvent.clear(input);
    await userEvent.type(input, 'another{Enter}');
    await waitFor(() => expect(canvas.getByRole('button', { name: '팔로잉' })).toBeEnabled());
    expect(successes().map(([event]) => event)).toEqual(['search_profile_view_succeeded']);
  },
};
