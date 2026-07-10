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
    relay: { data: { profileByHandle: result } },
    router: { params: { q: 'byulmaru', tab: 'people' }, pathname: '/search' },
  },
};

export const EmptyResult: Story = {
  parameters: {
    relay: { data: { profileByHandle: null } },
    router: { params: { q: '없는핸들', tab: 'people' }, pathname: '/search' },
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
        'kosmo.recent-searches',
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
    await userEvent.click(canvas.getByRole('button', { name: '별마루 최근 검색 삭제' }));
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
          title="프로필을 검색해 보세요"
        />
      </Section>
    </Catalog>
  ),
};
