import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { RelayEnvironmentProvider } from 'react-relay';
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
import { ShellChromeProvider, useShellChrome } from '@/components/shell/ShellChromeContext';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { GraphQLResponse, RequestParameters } from 'relay-runtime';

const emptyHomeTimeline = {
  edges: [],
  pageInfo: { endCursor: null, hasNextPage: false },
};
const selectedProfileData = {
  currentSession: {
    id: 'home-session',
    selectedProfile: {
      avatar: null,
      displayName: 'Home Profile',
      handle: 'home-profile',
      id: 'home-profile',
      private: { defaultPostVisibility: 'PUBLIC' },
      relativeHandle: '@home-profile',
    },
  },
  homeTimeline: emptyHomeTimeline,
  me: { id: 'home-account', name: 'home-account', profiles: [{ id: 'home-profile' }] },
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
  const environment = useMemo(
    () => createHomeRefreshEnvironment(profileMuteTimelineRevision),
    [profileMuteTimelineRevision],
  );

  return (
    <RelayEnvironmentProvider environment={environment}>
      <ShellChromeProvider
        navigationDrawerOpen={false}
        openNavigationDrawer={() => undefined}
        openProfileSwitcher={() => undefined}
        profileMuteTimelineRevision={profileMuteTimelineRevision}
        refreshProfileMuteTimelines={() =>
          setProfileMuteTimelineRevision((revision) => revision + 1)
        }
        registerHomeReselection={() => () => undefined}
        reselectHome={() => undefined}
      >
        <View>
          <HomeRefreshTrigger />
          <HomeScreen />
        </View>
      </ShellChromeProvider>
    </RelayEnvironmentProvider>
  );
}

function createHomeRefreshEnvironment(profileMuteTimelineRevision: number) {
  const environment = new Environment({
    network: Network.create((request: RequestParameters) => {
      if (request.name === 'HomePageQuery' && profileMuteTimelineRevision === 1) {
        return Promise.reject(new Error('홈 재조회 실패'));
      }

      return Promise.resolve({ data: selectedProfileData } as GraphQLResponse);
    }),
    store: new Store(new RecordSource()),
  });

  if (profileMuteTimelineRevision !== 1) {
    environment.commitPayload(
      createOperationDescriptor(getRequest(HomePageQueryNode), {}),
      selectedProfileData,
    );
  }

  return environment;
}

function HomeRefreshTrigger() {
  const shellChrome = useShellChrome();

  return (
    <Pressable
      accessibilityLabel="뮤트 변경 반영"
      accessibilityRole="button"
      onPress={() => {
        shellChrome?.refreshProfileMuteTimelines?.();
      }}
    >
      <Text>뮤트 변경 반영</Text>
    </Pressable>
  );
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
    const refresh = canvas.getByRole('button', { name: '뮤트 변경 반영' });

    await expect(canvas.findByText('아직 게시글이 없어요')).resolves.toBeVisible();

    await userEvent.click(refresh);
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent('홈을 불러오지 못했어요');
    expect(canvas.getByText('아직 게시글이 없어요')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent('홈을 불러오지 못했어요');
    expect(canvas.getByText('아직 게시글이 없어요')).toBeVisible();

    await userEvent.click(refresh);
    await waitFor(() => {
      expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
      expect(canvas.getByText('아직 게시글이 없어요')).toBeVisible();
    });
  },
  render: () => <HomeRefreshStory />,
};
