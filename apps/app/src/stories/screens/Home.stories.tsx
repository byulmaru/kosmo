import { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRelayEnvironment } from 'react-relay';
import {
  createOperationDescriptor,
  Environment,
  getRequest,
  Network,
  RecordSource,
  Store,
} from 'relay-runtime';
import { expect, spyOn, userEvent, waitFor, within } from 'storybook/test';
import HomePageQueryNode from '@/app/(tabs)/(protected)/__generated__/HomePageQuery.graphql';
import HomeScreen from '@/app/(tabs)/(protected)/home';
import { useProfileMuteMutations } from '@/components/profile/ProfileMuteController';
import { ShellChromeProvider, useShellChrome } from '@/components/shell/ShellChromeContext';
import { RelayActorProvider } from '@/relay/RelayActorProvider';
import { SessionProvider } from '@/session/SessionProvider';
import { post, profile, shellQuery, timeline } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { GraphQLResponse, RequestParameters } from 'relay-runtime';

const emptyHomeTimeline = {
  edges: [],
  pageInfo: { endCursor: null, hasNextPage: false },
};
const homeViewerProfile = profile({
  displayName: 'Home Profile',
  handle: 'home-profile',
  id: 'home-profile',
  relativeHandle: '@home-profile',
  viewerState: { follow: null, followRequest: null, isSelf: true, profileMute: null },
});
const homeTargetProfile = profile({
  displayName: 'Home Target',
  handle: 'home-target',
  id: 'home-target-profile',
  relativeHandle: '@home-target',
});
const homeMuteRelationId = 'home-profile-mute';
const homeTargetProfileAfterMute = profile({
  ...homeTargetProfile,
  viewerState: {
    follow: null,
    followRequest: null,
    isSelf: false,
    profileMute: { id: homeMuteRelationId },
  },
});
const selectedProfileData = {
  ...shellQuery({ profiles: [homeViewerProfile], selectedProfile: homeViewerProfile }),
  homeTimeline: emptyHomeTimeline,
};
const homeRefreshInitialPost = {
  ...post({
    bodyText: '뮤트 전 홈 게시글',
    id: 'home-refresh-initial-post',
    profile: homeTargetProfile,
  }),
  viewerReactions: [],
};
const homeRefreshRecoveredPost = {
  ...post({
    bodyText: '뮤트 후 복구된 홈 게시글',
    id: 'home-refresh-recovered-post',
    profile: homeTargetProfileAfterMute,
  }),
  viewerReactions: [],
};
const homeRefreshInitialData = {
  ...shellQuery({ profiles: [homeViewerProfile], selectedProfile: homeViewerProfile }),
  homeTimeline: timeline(homeRefreshInitialPost),
};
const homeRefreshRecoveredData = {
  ...shellQuery({ profiles: [homeViewerProfile], selectedProfile: homeViewerProfile }),
  homeTimeline: timeline(homeRefreshRecoveredPost),
};

const meta = {
  component: HomeScreen,
  parameters: { layout: 'fullscreen', router: { pathname: '/home' } },
  title: 'KOSMO/Screens/Home',
} satisfies Meta<typeof HomeScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

function expectHomeBrandHeader(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const headings = canvas.getAllByRole('heading', { name: '홈' });
  const mark = canvasElement.querySelector<HTMLImageElement>('[aria-hidden="true"] img');

  expect(headings).toHaveLength(1);
  expect(mark).not.toBeNull();
  expect(mark?.getBoundingClientRect().width).toBe(38);
  expect(mark?.closest('[aria-hidden="true"]')).not.toBeNull();
}

function HomeRefreshStory() {
  const [profileMuteTimelineRevision, setProfileMuteTimelineRevision] = useState(0);
  const homeRefreshStateRef = useRef({ revision: 0 });
  const [environment] = useState(() => createHomeRefreshEnvironment(homeRefreshStateRef));
  const createEnvironment = useCallback(() => environment, [environment]);

  return (
    <RelayActorProvider createEnvironment={createEnvironment}>
      <SessionProvider>
        <ShellChromeProvider
          navigationDrawerOpen={false}
          openNavigationDrawer={() => undefined}
          openProfileSwitcher={() => undefined}
          profileMuteTimelineRevision={profileMuteTimelineRevision}
          refreshProfileMuteTimelines={() => {
            homeRefreshStateRef.current.revision += 1;
            invalidateHomeQueryData(environment);
            setProfileMuteTimelineRevision((revision) => revision + 1);
          }}
          registerHomeReselection={() => () => undefined}
          reselectHome={() => undefined}
        >
          <View>
            <HomeRefreshTrigger />
            <HomeScreen />
          </View>
        </ShellChromeProvider>
      </SessionProvider>
    </RelayActorProvider>
  );
}

function createHomeRefreshEnvironment(homeRefreshStateRef: { current: { revision: number } }) {
  const environment = new Environment({
    network: Network.create((request: RequestParameters) => {
      if (request.name === 'SessionProviderQuery') {
        return Promise.resolve({ data: selectedProfileData } as GraphQLResponse);
      }

      if (request.name === 'ProfileMuteControllerMuteMutation') {
        return Promise.resolve({
          data: {
            muteProfile: {
              profileMute: {
                __typename: 'ProfileMute',
                id: homeMuteRelationId,
                targetProfile: { __typename: 'Profile', id: homeTargetProfile.id },
              },
            },
          },
        } as GraphQLResponse);
      }

      if (request.name === 'HomePageQuery') {
        if (homeRefreshStateRef.current.revision === 1) {
          return Promise.reject(new Error('홈 재조회 실패'));
        }

        return Promise.resolve({
          data:
            homeRefreshStateRef.current.revision === 0
              ? homeRefreshInitialData
              : homeRefreshRecoveredData,
        } as GraphQLResponse);
      }

      return Promise.resolve({ data: {} } as GraphQLResponse);
    }),
    store: new Store(new RecordSource()),
  });

  environment.commitPayload(
    createOperationDescriptor(getRequest(HomePageQueryNode), {}),
    homeRefreshInitialData,
  );

  return environment;
}

function invalidateHomeQueryData(environment: Environment) {
  environment.getStore().notify(undefined, true);
}

function HomeRefreshTrigger() {
  const environment = useRelayEnvironment();
  const shellChrome = useShellChrome();
  const { changeMuted } = useProfileMuteMutations();
  const [, refreshMuteRelation] = useState(0);
  const rereadMuteRelation = () => refreshMuteRelation((version) => version + 1);
  const muteRelationVisible = hasProfileMute(environment, homeTargetProfile.id);

  const applyMute = async () => {
    try {
      await changeMuted(
        {
          ownerProfileId: homeViewerProfile.id,
          targetProfileId: homeTargetProfile.id,
        },
        true,
      );
      rereadMuteRelation();
    } catch {
      return;
    }
  };

  return (
    <>
      <Pressable
        accessibilityLabel="프로필 뮤트 적용"
        accessibilityRole="button"
        onPress={() => void applyMute()}
      >
        <Text>프로필 뮤트 적용</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="다음 revision 복구"
        accessibilityRole="button"
        onPress={() => shellChrome?.refreshProfileMuteTimelines?.()}
      >
        <Text>다음 revision 복구</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="뮤트 관계 상태 다시 읽기"
        accessibilityRole="button"
        onPress={rereadMuteRelation}
      >
        <Text>뮤트 관계 상태 다시 읽기</Text>
      </Pressable>
      <Text>뮤트 관계: {muteRelationVisible ? '유지됨' : '없음'}</Text>
    </>
  );
}

function hasProfileMute(environment: Environment, targetProfileId: string) {
  const source = environment.getStore().getSource();
  const targetProfile = source.get(targetProfileId);
  const viewerStateId = getRelayRecordRef(targetProfile?.viewerState);
  const viewerState = viewerStateId ? source.get(viewerStateId) : null;

  return Boolean(getRelayRecordRef(viewerState?.profileMute));
}

function getRelayRecordRef(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const ref = (value as { __ref?: unknown }).__ref;
  return typeof ref === 'string' ? ref : null;
}

export const EmptyTimelineFull: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  parameters: {
    relay: { operationResponses: { HomePageQuery: { data: selectedProfileData } } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const emptyTitle = await canvas.findByText('아직 게시글이 없어요');
    const timeline = emptyTitle.parentElement?.parentElement;

    expect(emptyTitle).toBeVisible();
    expect(timeline).not.toBeNull();
    expect(timeline).toHaveStyle({ paddingBottom: '0px', paddingTop: '0px' });
    expectHomeBrandHeader(canvasElement);
  },
};

export const OnboardingCompact: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  parameters: {
    relay: {
      operationResponses: {
        HomePageQuery: {
          data: {
            currentSession: { id: 'home-session', selectedProfile: null },
            homeTimeline: emptyHomeTimeline,
            me: { id: 'home-account', name: 'home-account', profiles: [] },
          },
        },
      },
    },
  },
  play: ({ canvasElement }) => expectHomeBrandHeader(canvasElement),
};

export const LoadingFull: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  parameters: {
    relay: {
      operationResponses: { HomePageQuery: { data: selectedProfileData, delayMs: 60_000 } },
    },
  },
  play: ({ canvasElement }) => expectHomeBrandHeader(canvasElement),
};

export const ErrorFull: Story = {
  beforeEach: () => {
    const originalError = console.error;
    const errorSpy = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (!args.some((argument) => String(argument).includes('홈을 불러오지 못했습니다.'))) {
        originalError(...args);
      }
    });

    return () => errorSpy.mockRestore();
  },
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  parameters: {
    relay: { operationResponses: { HomePageQuery: { error: '홈을 불러오지 못했습니다.' } } },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).findByRole('alert')).resolves.toBeVisible();
    expectHomeBrandHeader(canvasElement);
  },
};

export const RefetchFailureKeepsTimelineAndRecovers: Story = {
  beforeEach: () => {
    const originalError = console.error;
    const errorSpy = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (!args.some((argument) => String(argument).includes('홈 재조회 실패'))) {
        originalError(...args);
      }
    });

    return () => errorSpy.mockRestore();
  },
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const applyMute = canvas.getByRole('button', { name: '프로필 뮤트 적용' });
    const recover = canvas.getByRole('button', { name: '다음 revision 복구' });
    const rereadMuteRelation = canvas.getByRole('button', { name: '뮤트 관계 상태 다시 읽기' });

    await expect(canvas.findByText('뮤트 전 홈 게시글')).resolves.toBeVisible();

    await userEvent.click(applyMute);
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent('홈을 불러오지 못했어요');
    await userEvent.click(rereadMuteRelation);
    await expect(canvas.findByText('뮤트 관계: 유지됨')).resolves.toBeVisible();
    expect(canvas.getByText('뮤트 전 홈 게시글')).toBeVisible();
    expect(canvas.queryByText('뮤트 후 복구된 홈 게시글')).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent('홈을 불러오지 못했어요');
    await userEvent.click(rereadMuteRelation);
    expect(canvas.getByText('뮤트 관계: 유지됨')).toBeVisible();
    expect(canvas.getByText('뮤트 전 홈 게시글')).toBeVisible();
    expect(canvas.queryByText('뮤트 후 복구된 홈 게시글')).not.toBeInTheDocument();

    await userEvent.click(recover);
    await waitFor(() => {
      expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
      expect(canvas.getByText('뮤트 후 복구된 홈 게시글')).toBeVisible();
      expect(canvas.queryByText('뮤트 전 홈 게시글')).not.toBeInTheDocument();
    });
    await userEvent.click(rereadMuteRelation);
    expect(canvas.getByText('뮤트 관계: 유지됨')).toBeVisible();
  },
  render: () => <HomeRefreshStory />,
};
