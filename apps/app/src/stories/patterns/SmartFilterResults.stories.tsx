import { SettingsSmartFilterResults } from '@/components/settings/SettingsSmartFilterResults';
import { post, profile } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';

const selectedProfile = profile({
  displayName: '스마트 필터 회원',
  handle: 'smart-filter-member',
  id: 'smart-filter-results-member',
  relativeHandle: '@smart-filter-member',
  viewerState: {
    follow: null,
    followRequest: null,
    isSelf: true,
    membership: { role: 'MEMBER' },
  },
});

const queryData = {
  currentSession: {
    id: 'smart-filter-results-session',
    selectedProfile,
  },
};

const resultPosts = [
  {
    ...post({
      bodyText: '비가 그친 뒤 공원 산책길에 작은 꽃잎이 놓여 있었습니다.',
      id: 'smart-filter-result-pass',
    }),
    smartFilterProbability: 0.7999,
    viewerReactions: [],
  },
  {
    ...post({
      bodyText: '이번 주 독서 모임에서 새 소설의 마지막 장을 함께 읽었습니다.',
      id: 'smart-filter-result-exclude',
    }),
    smartFilterProbability: 0.8,
    viewerReactions: [],
  },
];

const meta = {
  component: SettingsSmartFilterResults,
  parameters: {
    layout: 'fullscreen',
    relay: {
      data: queryData,
      operationResponses: {
        SettingsSmartFilterResultsQuery: {
          data: {
            ...queryData,
            homeTimeline: {
              edges: resultPosts.map((node, index) => ({
                cursor: `smart-filter-result-${index}`,
                node,
              })),
              pageInfo: {
                endCursor: 'smart-filter-result-1',
                hasNextPage: false,
              },
            },
          },
        },
      },
    },
  },
  title: 'KOSMO/Patterns/Smart Filter Results',
} satisfies Meta<typeof SettingsSmartFilterResults>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
};
