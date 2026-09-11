import { useCallback, useMemo, useRef } from 'react';
import { fn } from 'storybook/test';
import LocalScreen from '@/app/(tabs)/(protected)/local';
import { Button } from '@/components/ui/Button';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { ShellChromeProvider } from '@/components/shell/ShellChromeContext';
import { RelayStoryProvider } from '../../../.storybook/mocks/react-relay';
import { post, profile, timeline } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps } from 'react';

const selectedProfile = profile({
  displayName: '로컬 기록자',
  handle: 'local-writer',
  id: 'local-story-profile',
  relativeHandle: '@local-writer',
});
const secondAuthor = profile({
  displayName: '별빛 여행자',
  handle: 'starlight',
  id: 'local-story-second-author',
  relativeHandle: '@starlight',
});

function localPost({
  bodyText,
  id,
  profile: author = selectedProfile,
}: Parameters<typeof post>[0] = {}) {
  return { ...post({ bodyText, id, profile: author }), viewerReactions: [] };
}

const firstPost = localPost({
  bodyText: '같은 인스턴스의 소식을 한곳에서 확인해요.',
  id: 'local-story-post-1',
});
const secondPost = localPost({
  bodyText: '오늘의 로컬 이야기를 나눠요.',
  id: 'local-story-post-2',
  profile: secondAuthor,
});
const longPost = localPost({
  bodyText:
    '긴 본문도 게시글 카드 안에서 자연스럽게 줄바꿈됩니다. 로컬 타임라인의 실제 콘텐츠 길이에 가까운 문장과 줄바꿈을 확인하기 위한 상태입니다.\n\n새로운 소식이 이어지는 동안에도 작성자와 본문을 한 번에 읽을 수 있어요.',
  id: 'local-story-long-post',
});
const paginationPost = localPost({
  bodyText: '첫 페이지에 남아 있는 로컬 게시글입니다.',
  id: 'local-story-pagination-first',
});
const paginationNextPost = localPost({
  bodyText: '다시 시도한 뒤 추가된 로컬 게시글입니다.',
  id: 'local-story-pagination-next',
  profile: secondAuthor,
});
const refreshedPost = localPost({
  bodyText: '새로고침에 성공한 뒤 다시 표시된 로컬 게시글입니다.',
  id: 'local-story-refresh-success',
});

function localConnection(posts: ReadonlyArray<ReturnType<typeof localPost>>, hasNextPage = false) {
  const connection = timeline(...posts);
  return {
    ...connection,
    pageInfo: {
      ...connection.pageInfo,
      endCursor: hasNextPage ? (posts.at(-1)?.id ?? null) : null,
      hasNextPage,
    },
  };
}

function localPageData(localTimeline = localConnection([firstPost, secondPost])) {
  return {
    currentSession: { id: 'local-story-session', selectedProfile },
    localTimeline,
    me: { id: 'local-story-account', profiles: [{ id: selectedProfile.id }] },
  };
}

const scrollPosts = Array.from({ length: 20 }, (_, index) =>
  localPost({
    bodyText: `스크롤로 확인하는 로컬 게시글 ${index + 1}`,
    id: `local-story-scroll-${index + 1}`,
  }),
);
const scrollNextPost = localPost({
  bodyText: '다음 페이지에서 추가된 로컬 게시글입니다.',
  id: 'local-story-scroll-next',
});
const paginationData = localPageData(localConnection([paginationPost], true));
const paginationNextPage = {
  data: { localTimeline: localConnection([paginationNextPost]) },
};

const paginationRequestObserver = fn().mockName('Local pagination request');
export const queryRequestObserver = fn().mockName('Local query: load / refresh / retry');

type LocalOperationResponses = NonNullable<
  ComponentProps<typeof RelayStoryProvider>['operationResponses']
>;

function localOperationResponses(
  queryResponse: LocalOperationResponses[string],
  refetchResponse: LocalOperationResponses[string] = queryResponse,
): LocalOperationResponses {
  return { LocalPageQuery: queryResponse, LocalContentRefetchQuery: refetchResponse };
}

type LocalState =
  | 'default'
  | 'loading'
  | 'empty'
  | 'error'
  | 'refresh-hard-error'
  | 'refresh-hard-error-lifetime'
  | 'refresh-partial-error'
  | 'refreshing'
  | 'filtered'
  | 'long-content'
  | 'pagination-loading'
  | 'pagination-flow'
  | 'pagination-error';

type LocalStoryArgs = {
  actorBoundary?: boolean;
  showActorReset?: boolean;
  state: LocalState;
};

function localRelayForState(state: LocalState) {
  switch (state) {
    case 'loading':
      return {
        operationResponses: localOperationResponses({ data: localPageData(), delayMs: 60_000 }),
      };
    case 'empty':
      return {
        operationResponses: localOperationResponses({ data: localPageData(localConnection([])) }),
      };
    case 'error':
      return {
        operationResponses: localOperationResponses({
          sequence: [{ error: '로컬 타임라인을 불러오지 못했습니다.' }, { data: localPageData() }],
        }),
      };
    case 'refresh-hard-error':
      return {
        operationResponses: localOperationResponses(
          { data: localPageData() },
          {
            sequence: [
              { error: 'Local timeline hard refresh failure' },
              { error: 'Local timeline hard refresh failure again' },
              { data: localPageData(localConnection([refreshedPost])), delayMs: 500 },
            ],
          },
        ),
      };
    case 'refresh-hard-error-lifetime':
      return {
        operationResponses: localOperationResponses(
          { data: localPageData() },
          {
            sequence: [
              { error: 'Local timeline hard refresh failure' },
              { delayMs: 500, error: 'Local timeline hard refresh failure after actor reset' },
            ],
          },
        ),
      };
    case 'long-content':
      return {
        operationResponses: localOperationResponses({
          data: localPageData(localConnection([longPost, secondPost])),
        }),
      };
    case 'refreshing':
      return {
        operationResponses: localOperationResponses(
          { data: localPageData() },
          {
            sequence: [{ data: localPageData(localConnection([refreshedPost])), delayMs: 2_000 }],
          },
        ),
      };
    case 'refresh-partial-error':
      return {
        operationResponses: localOperationResponses(
          { data: localPageData() },
          {
            sequence: [
              {
                data: { ...localPageData(), localTimeline: null },
                errors: [{ message: 'Local timeline resolver failed' }],
              },
              {
                data: { ...localPageData(localConnection([refreshedPost])), me: null },
                errors: [{ message: 'Account resolver failed' }],
              },
            ],
          },
        ),
      };
    case 'filtered':
      return {
        operationResponses: localOperationResponses({
          data: localPageData(localConnection([firstPost])),
        }),
      };
    case 'pagination-flow':
      return {
        operationResponses: localOperationResponses({
          data: localPageData(localConnection(scrollPosts, true)),
        }),
        paginationResponses: [
          { data: { localTimeline: localConnection([scrollNextPost]) }, delayMs: 2_000 },
        ],
      };
    case 'pagination-loading':
      return {
        operationResponses: localOperationResponses({ data: paginationData }),
        paginationLoading: true,
      };
    case 'pagination-error':
      return {
        operationResponses: localOperationResponses({ data: paginationData }),
        paginationResponses: [
          { error: '로컬 타임라인 다음 page를 불러오지 못했습니다.' },
          paginationNextPage,
        ],
      };
    case 'default':
      return { operationResponses: localOperationResponses({ data: localPageData() }) };
  }
}

function LocalPlayground({ actorBoundary = false, showActorReset = false, state }: LocalStoryArgs) {
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
  const relay = useMemo(() => localRelayForState(state), [state]);

  return (
    <RelayStoryProvider
      actorBoundary={actorBoundary}
      key={state}
      operationResponses={relay.operationResponses}
      paginationLoading={relay.paginationLoading}
      paginationRequestObserver={paginationRequestObserver}
      paginationResponses={relay.paginationResponses}
      queryRequestObserver={queryRequestObserver}
    >
      <ShellChromeProvider
        navigationDrawerOpen={false}
        openNavigationDrawer={() => undefined}
        openProfileSwitcher={() => undefined}
        registerHomeReselection={registerHomeReselection}
        reselectHome={reselectHome}
      >
        {showActorReset ? <LocalActorResetScreen /> : <LocalScreen />}
      </ShellChromeProvider>
    </RelayStoryProvider>
  );
}

function LocalActorResetScreen() {
  const { resetActor } = useRelayActor();

  return (
    <>
      <Button onPress={() => resetActor('local-story-second-profile')}>프로필 전환</Button>
      <LocalScreen />
    </>
  );
}

const meta = {
  argTypes: {
    state: {
      control: 'select',
      description:
        'refresh-partial-error: 로컬 탭 재선택 시 부분 응답을 적용하고, 다시 선택하면 성공 응답을 적용합니다. filtered: 뮤트·차단 대상을 서버에서 제외한 결과 예시이며 filtering 정책을 실행하지 않습니다.',
      options: [
        'default',
        'loading',
        'empty',
        'error',
        'refresh-hard-error',
        'refresh-partial-error',
        'refreshing',
        'filtered',
        'long-content',
        'pagination-loading',
        'pagination-flow',
        'pagination-error',
      ],
    },
  },
  component: LocalPlayground,
  excludeStories: [
    'InitialErrorRetry',
    'PaginationErrorRetry',
    'RefreshHardErrorActorCleanup',
    'queryRequestObserver',
  ],
  parameters: {
    layout: 'fullscreen',
    router: { pathname: '/local' },
  },
  title: 'KOSMO/Screens/Local',
} satisfies Meta<typeof LocalPlayground>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { state: 'default' },
  parameters: { controls: { disable: false, include: ['state'] } },
};

export const Mobile390: Story = {
  args: { state: 'default' },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: { controls: { disable: true } },
};

export const Compact1024: Story = {
  args: { state: 'default' },
  globals: { viewport: { isRotated: false, value: 'kosmoProfileCompact' } },
  parameters: { controls: { disable: true } },
};

export const Full1440: Story = {
  args: { state: 'default' },
  globals: { viewport: { isRotated: false, value: 'kosmoProfileFull' } },
  parameters: { controls: { disable: true } },
};

export const Refreshing: Story = {
  args: { state: 'refreshing' },
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        story:
          '로컬 탭을 다시 선택하면 Relay 기본 조회 경로로 요청하고 2초 뒤 최신 글로 갱신됩니다.',
      },
    },
  },
};

export const PaginationFlow: Story = {
  args: { state: 'pagination-flow' },
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        story:
          '20개 글 아래로 스크롤하면 하단에 2초 동안 로딩 표시가 나타난 뒤 다음 글이 추가됩니다.',
      },
    },
  },
};

export const InitialErrorRetry: Story = {
  args: { state: 'error' },
};

export const RefreshHardError: Story = {
  args: { state: 'refresh-hard-error' },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  name: 'Refresh Hard Error (Reselect Local)',
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        story:
          '마지막 성공 목록을 유지한 상태에서 로컬 탭을 다시 선택하면 지속되는 오류 Toast가 나타납니다.',
      },
    },
  },
};

export const RefreshHardErrorActorCleanup: Story = {
  args: { actorBoundary: true, showActorReset: true, state: 'refresh-hard-error-lifetime' },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  name: 'Refresh Hard Error Actor Cleanup',
  parameters: { controls: { disable: true } },
};

export const PaginationErrorRetry: Story = {
  args: { state: 'pagination-error' },
};
