import { expect, userEvent, within } from 'storybook/test';
import SearchScreen from '@/app/(tabs)/(protected)/search';
import { StateView } from '@/components/ui/StateView';
import { profile } from './fixtures';
import { Catalog, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';

const result = profile({
  bio: '코스모에서 만나는 첫 프로필',
  displayName: '별마루',
  handle: 'byulmaru',
  id: 'profile-byulmaru',
  relativeHandle: '@byulmaru',
});
const secondResult = profile({
  displayName: '별마루 개발',
  handle: 'byulmaru-dev',
  id: 'profile-byulmaru-dev',
  relativeHandle: '@byulmaru-dev',
});
const thirdResult = profile({
  displayName: '별마루 운영',
  handle: 'byulmaru-ops',
  id: 'profile-byulmaru-ops',
  relativeHandle: '@byulmaru-ops',
});

const searchConnection = (
  profiles: ReadonlyArray<ReturnType<typeof profile>>,
  hasNextPage = false,
) => ({
  edges: profiles.map((node) => ({ cursor: node.handle, node })),
  pageInfo: {
    endCursor: profiles.at(-1)?.handle ?? null,
    hasNextPage,
  },
});

const meta = {
  component: SearchScreen,
  title: 'KOSMO/Search/SearchScreen',
} satisfies Meta<typeof SearchScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  parameters: { router: { params: {}, pathname: '/search' } },
};

export const Result: Story = {
  parameters: {
    relay: { data: { searchProfiles: searchConnection([result, secondResult]) } },
    router: { params: { q: 'byulmaru', tab: 'people' }, pathname: '/search' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: /@byulmaru / })).toHaveAttribute(
      'href',
      '/@byulmaru',
    );
    await expect(canvas.getByRole('link', { name: /@byulmaru-dev / })).toHaveAttribute(
      'href',
      '/@byulmaru-dev',
    );
  },
};

export const EmptyResult: Story = {
  parameters: {
    relay: { data: { searchProfiles: searchConnection([]) } },
    router: { params: { q: '없는핸들', tab: 'people' }, pathname: '/search' },
  },
};

export const NextPageFailureRetrySucceeds: Story = {
  parameters: {
    relay: {
      data: { searchProfiles: searchConnection([result, secondResult], true) },
      paginationResponses: [
        { error: '다음 검색 결과를 불러오지 못했습니다.' },
        { data: { searchProfiles: searchConnection([thirdResult]) } },
      ],
    },
    router: { params: { q: 'byulmaru', tab: 'people' }, pathname: '/search' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '검색 결과 더 보기' }));
    await expect(canvas.findByRole('alert')).resolves.toHaveTextContent(
      '다음 검색 결과를 불러오지 못했어요',
    );
    expect(canvas.queryByText('별마루 운영')).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: '다음 검색 결과 다시 불러오기' }));
    await expect(canvas.findByText('별마루 운영')).resolves.toBeVisible();
    expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};

export const NextPageLoading: Story = {
  parameters: {
    relay: {
      data: { searchProfiles: searchConnection([result, secondResult], true) },
      paginationLoading: true,
    },
    router: { params: { q: 'byulmaru', tab: 'people' }, pathname: '/search' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: '검색 결과 더 보기' });
    await userEvent.click(button);
    await expect(button).toBeDisabled();
  },
};

export const PreparedNonPeopleTabs: Story = {
  parameters: {
    router: { params: { q: '별마루', tab: 'popular' }, pathname: '/search' },
  },
};

export const RecentSearchInteraction: Story = {
  loaders: [
    async () => {
      globalThis.localStorage?.setItem(
        'kosmo:recent-searches',
        JSON.stringify(['별마루', '@remote@space.example']),
      );
      return {};
    },
  ],
  parameters: { router: { params: {}, pathname: '/search' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('textbox', { name: '검색어' }));
    await expect(canvas.findByText('별마루')).resolves.toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: "최근 검색 '별마루' 삭제" }));
    await expect(canvas.queryByText('별마루')).not.toBeInTheDocument();
  },
};

export const LoadingAndErrorBoundaries: Story = {
  render: () => (
    <Catalog>
      <Section title="Search loading">
        <StateView loading title="검색 결과를 불러오는 중입니다." />
      </Section>
      <Section title="Search error">
        <StateView
          actionLabel="다시 시도"
          description="잠시 후 다시 시도해 주세요."
          onAction={() => undefined}
          title="검색 결과를 불러오지 못했어요"
        />
      </Section>
      <Section title="No query">
        <StateView
          description="handle을 입력하면 일치하는 프로필을 찾아드려요."
          title="프로필을 검색해보세요"
        />
      </Section>
    </Catalog>
  ),
};
