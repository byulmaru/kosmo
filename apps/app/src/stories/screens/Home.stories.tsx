import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
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
import { ShellChromeProvider } from '@/components/shell/ShellChromeContext';
import { RelayActorProvider } from '@/relay/RelayActorProvider';
import { post, profile, shellQuery, timeline } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';

const emptyHomeTimeline = {
  edges: [],
  pageInfo: { endCursor: null, hasNextPage: false },
};
const selectedProfileData = {
  currentSession: { id: 'home-session', selectedProfile: { id: 'home-profile' } },
  homeTimeline: emptyHomeTimeline,
  me: { id: 'home-account', name: 'home-account', profiles: [{ id: 'home-profile' }] },
};
const cachedHomeProfile = profile({
  displayName: 'Home Profile',
  handle: 'home-profile',
  id: 'home-profile-cached',
  relativeHandle: '@home-profile-cached',
  viewerState: { follow: null, followRequest: null, isSelf: true },
});
const cachedHomePost = {
  ...post({
    bodyText: '캐시된 홈 게시글',
    id: 'home-cached-post',
    profile: cachedHomeProfile,
    visibility: 'PUBLIC',
  }),
  viewerReactions: [],
};
const recoveredHomePost = {
  ...post({
    bodyText: '복구된 홈 게시글',
    id: 'home-recovered-post',
    profile: cachedHomeProfile,
    visibility: 'PUBLIC',
  }),
  viewerReactions: [],
};
const cachedHomeData = {
  ...shellQuery({ profiles: [cachedHomeProfile], selectedProfile: cachedHomeProfile }),
  homeTimeline: timeline(cachedHomePost),
};
const recoveredHomeData = {
  ...shellQuery({ profiles: [cachedHomeProfile], selectedProfile: cachedHomeProfile }),
  homeTimeline: timeline(recoveredHomePost),
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
  const homeReselectionRef = useRef<(() => void) | null>(null);
  const registerHomeReselection = useCallback((handler: () => void) => {
    homeReselectionRef.current = handler;
    return () => {
      if (homeReselectionRef.current === handler) {
        homeReselectionRef.current = null;
      }
    };
  }, []);
  const reselectHome = useCallback(() => homeReselectionRef.current?.(), []);

  return (
    <ShellChromeProvider
      navigationDrawerOpen={false}
      openNavigationDrawer={() => undefined}
      openProfileSwitcher={() => undefined}
      registerHomeReselection={registerHomeReselection}
      reselectHome={reselectHome}
    >
      <View>
        <Pressable
          accessibilityLabel="홈 다시 불러오기"
          accessibilityRole="button"
          onPress={reselectHome}
        >
          <Text>홈 다시 불러오기</Text>
        </Pressable>
        <HomeScreen />
      </View>
    </ShellChromeProvider>
  );
}

function CachedHomeAutoRevalidationStory() {
  const [requestCount, setRequestCount] = useState(0);
  const environment = useMemo(() => {
    const network = Network.create((request) => {
      if (request.name === 'HomePageQuery') {
        setRequestCount((count) => count + 1);
        return Promise.reject(new Error('홈 자동 재검증 실패'));
      }

      return Promise.resolve({ data: {} });
    });
    const nextEnvironment = new Environment({
      network,
      store: new Store(new RecordSource()),
    });

    nextEnvironment.commitPayload(
      createOperationDescriptor(getRequest(HomePageQueryNode), {}),
      cachedHomeData,
    );
    return nextEnvironment;
  }, []);
  const createEnvironment = useCallback(() => environment, [environment]);

  return (
    <RelayActorProvider createEnvironment={createEnvironment}>
      <HomeScreen />
      <Text testID="home-automatic-request-count">{requestCount}</Text>
    </RelayActorProvider>
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
      if (args[0] === 'Route error') {
        expect(args[1]).toEqual(expect.objectContaining({ message: '홈을 불러오지 못했습니다.' }));
      }
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
    const canvas = within(canvasElement);
    const alert = await canvas.findByRole('alert');
    expect(alert).toBeVisible();
    expect(canvas.queryByText('사용할 프로필을 선택해주세요')).not.toBeInTheDocument();
    expect(canvas.queryByText('프로필을 만들어 시작하세요')).not.toBeInTheDocument();
    expect(canvas.getByText('잠시 후 다시 시도해주세요.')).toBeVisible();
    expectHomeBrandHeader(canvasElement);
  },
};

export const RefetchFailureKeepsCachedTimelineAndRecovers: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  parameters: {
    relay: {
      operationResponses: {
        HomePageQuery: {
          sequence: [
            { data: cachedHomeData },
            { delayMs: 300, error: '홈 재조회 실패' },
            { data: recoveredHomeData },
          ],
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(canvas.findByText('캐시된 홈 게시글')).resolves.toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: '홈 다시 불러오기' }));
    expect(canvas.queryByText('홈을 불러오는 중입니다.')).not.toBeInTheDocument();
    expect(canvas.getByText('캐시된 홈 게시글')).toBeVisible();
    const refreshToast = await body.findByText('홈을 새로 불러오지 못했어요.');
    await waitFor(() => expect(refreshToast).toBeVisible());
    expect(canvas.queryByText('잠시 후 다시 시도해주세요.')).not.toBeInTheDocument();
    expect(canvas.getByText('캐시된 홈 게시글')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: '홈 다시 불러오기' }));
    await expect(canvas.findByText('복구된 홈 게시글')).resolves.toBeVisible();
    expect(canvas.queryByText('잠시 후 다시 시도해주세요.')).not.toBeInTheDocument();
    expect(canvas.queryByText('캐시된 홈 게시글')).not.toBeInTheDocument();
  },
  render: () => <HomeRefreshStory />,
};

export const CachedMountRevalidationFailureKeepsTimeline: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(canvas.findByText('캐시된 홈 게시글')).resolves.toBeVisible();

    const refreshToast = await body.findByText('홈을 새로 불러오지 못했어요.');
    await waitFor(() => expect(refreshToast).toBeVisible());
    expect(canvas.getByText('캐시된 홈 게시글')).toBeVisible();
    expect(canvas.queryByText('잠시 후 다시 시도해주세요.')).not.toBeInTheDocument();
    expect(canvas.queryByText('홈을 불러오는 중입니다.')).not.toBeInTheDocument();
    expect(canvas.getByTestId('home-automatic-request-count')).toHaveTextContent('1');
  },
  render: () => <CachedHomeAutoRevalidationStory />,
};
