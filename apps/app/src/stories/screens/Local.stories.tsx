import { useMemo } from 'react';
import { fn } from 'storybook/test';
import LocalScreen from '@/app/(tabs)/(protected)/local';
import { RelayStoryProvider } from '../../../.storybook/mocks/react-relay';
import { post, profile, timeline } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';

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

type LocalState =
  | 'default'
  | 'loading'
  | 'empty'
  | 'error'
  | 'refresh-hard-error'
  | 'refresh-partial-error'
  | 'refreshing'
  | 'filtered'
  | 'long-content'
  | 'pagination-loading'
  | 'pagination-flow'
  | 'pagination-error';

type LocalStoryArgs = { state: LocalState };

function localRelayForState(state: LocalState) {
  switch (state) {
    case 'loading':
      return {
        operationResponses: {
          LocalPageQuery: { data: localPageData(), delayMs: 60_000 },
        },
      };
    case 'empty':
      return {
        operationResponses: { LocalPageQuery: { data: localPageData(localConnection([])) } },
      };
    case 'error':
      return {
        operationResponses: {
          LocalPageQuery: {
            sequence: [
              { error: '로컬 타임라인을 불러오지 못했습니다.' },
              { data: localPageData() },
            ],
          },
        },
      };
    case 'refresh-hard-error':
      return {
        operationResponses: {
          LocalPageQuery: {
            sequence: [{ data: localPageData() }, { error: 'Local timeline hard refresh failure' }],
          },
        },
      };
    case 'long-content':
      return {
        operationResponses: {
          LocalPageQuery: { data: localPageData(localConnection([longPost, secondPost])) },
        },
      };
    case 'refreshing':
      return {
        operationResponses: {
          LocalPageQuery: {
            sequence: [
              { data: localPageData() },
              { data: localPageData(localConnection([refreshedPost])), delayMs: 2_000 },
            ],
          },
        },
      };
    case 'refresh-partial-error':
      return {
        operationResponses: {
          LocalPageQuery: {
            sequence: [
              { data: localPageData() },
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
        },
      };
    case 'filtered':
      return {
        operationResponses: {
          LocalPageQuery: { data: localPageData(localConnection([firstPost])) },
        },
      };
    case 'pagination-flow':
      return {
        operationResponses: {
          LocalPageQuery: { data: localPageData(localConnection(scrollPosts, true)) },
        },
        paginationResponses: [
          { data: { localTimeline: localConnection([scrollNextPost]) }, delayMs: 2_000 },
        ],
      };
    case 'pagination-loading':
      return {
        operationResponses: { LocalPageQuery: { data: paginationData } },
        paginationLoading: true,
      };
    case 'pagination-error':
      return {
        operationResponses: { LocalPageQuery: { data: paginationData } },
        paginationResponses: [
          { error: '로컬 타임라인 다음 page를 불러오지 못했습니다.' },
          paginationNextPage,
        ],
      };
    case 'default':
      return { operationResponses: { LocalPageQuery: { data: localPageData() } } };
  }
}

function LocalPlayground({ state }: LocalStoryArgs) {
  const relay = useMemo(() => localRelayForState(state), [state]);

  return (
    <RelayStoryProvider
      key={state}
      operationResponses={relay.operationResponses}
      paginationLoading={relay.paginationLoading}
      paginationRequestObserver={paginationRequestObserver}
      paginationResponses={relay.paginationResponses}
      queryRequestObserver={queryRequestObserver}
    >
      <LocalScreen />
    </RelayStoryProvider>
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
  excludeStories: ['InitialErrorRetry', 'PaginationErrorRetry', 'queryRequestObserver'],
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
};

export const PaginationErrorRetry: Story = {
  args: { state: 'pagination-error' },
};
