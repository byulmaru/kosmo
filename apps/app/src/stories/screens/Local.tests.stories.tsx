import { expect, userEvent, waitFor, within } from 'storybook/test';
import baseMeta, {
  InitialErrorRetry as initialErrorRetry,
  PaginationErrorRetry as paginationErrorRetry,
  PaginationFlow as paginationFlow,
  queryRequestObserver,
  RefreshHardError as refreshHardError,
  Refreshing as refreshing,
} from './Local.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Screens/Local/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const InitialErrorRetry: Story = {
  ...initialErrorRetry,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const alert = await body.findByRole('alert');

    expect(alert).toHaveTextContent('로컬 타임라인을 불러오지 못했어요');
    expect(canvas.queryByText('아직 게시글이 없어요')).not.toBeInTheDocument();
    await userEvent.click(within(alert).getByRole('button', { name: '다시 시도' }));
    await expect(
      canvas.findByText('같은 인스턴스의 소식을 한곳에서 확인해요.'),
    ).resolves.toBeVisible();
    expect(body.queryByRole('alert')).not.toBeInTheDocument();
  },
};

export const RefreshPartialResponse: Story = {
  args: { state: 'refresh-partial-error' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      canvas.findByText('같은 인스턴스의 소식을 한곳에서 확인해요.'),
    ).resolves.toBeVisible();
    await userEvent.click(canvas.getByRole('tab', { name: '로컬' }));
    await expect(canvas.findByText('아직 게시글이 없어요')).resolves.toBeVisible();
    expect(canvas.queryByText('같은 인스턴스의 소식을 한곳에서 확인해요.')).not.toBeInTheDocument();
    expect(body.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('tab', { name: '로컬' }));
    await expect(
      canvas.findByText('새로고침에 성공한 뒤 다시 표시된 로컬 게시글입니다.'),
    ).resolves.toBeVisible();
  },
};

export const RefreshHardError: Story = {
  ...refreshHardError,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const localTab = canvas.getByRole('tab', { name: '로컬' });
    await expect(
      canvas.findByText('같은 인스턴스의 소식을 한곳에서 확인해요.'),
    ).resolves.toBeVisible();
    expect(
      canvas.getByRole('link', { name: '로컬 기록자 @local-writer' }).getBoundingClientRect().top,
    ).toBeGreaterThanOrEqual(localTab.getBoundingClientRect().bottom);

    await userEvent.click(localTab);
    await waitFor(() => expect(queryRequestObserver).toHaveBeenCalledTimes(2));

    expect(canvas.getByText('같은 인스턴스의 소식을 한곳에서 확인해요.')).toBeVisible();
    const firstAlert = body.getByRole('alert');
    expect(firstAlert).toHaveTextContent('로컬 타임라인을 불러오지 못했어요');
    expect(within(firstAlert).getByRole('button', { name: '다시 시도' })).toBeVisible();

    await userEvent.click(within(firstAlert).getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(queryRequestObserver).toHaveBeenCalledTimes(3));
    expect(canvas.getByText('같은 인스턴스의 소식을 한곳에서 확인해요.')).toBeVisible();
    const secondAlert = body.getByRole('alert');
    expect(secondAlert).toHaveTextContent('로컬 타임라인을 불러오지 못했어요');
    expect(within(secondAlert).getByRole('button', { name: '다시 시도' })).toBeVisible();

    await userEvent.click(within(secondAlert).getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(queryRequestObserver).toHaveBeenCalledTimes(4));
    await expect(
      canvas.findByText('새로고침에 성공한 뒤 다시 표시된 로컬 게시글입니다.'),
    ).resolves.toBeVisible();
    await waitFor(() => expect(body.queryByRole('alert')).not.toBeInTheDocument());
  },
};

function scrollStoryToEnd(canvasElement: HTMLElement) {
  const storyWindow = canvasElement.ownerDocument.defaultView!;
  storyWindow.scrollTo(0, storyWindow.document.documentElement.scrollHeight);
  storyWindow.dispatchEvent(new Event('scroll'));
  return storyWindow;
}

export const PaginationErrorRetry: Story = {
  ...paginationErrorRetry,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const storyWindow = scrollStoryToEnd(canvasElement);

    await expect(body.findByRole('alert')).resolves.toHaveTextContent(
      '게시글을 더 불러오지 못했어요.',
    );
    expect(canvas.getByText('첫 페이지에 남아 있는 로컬 게시글입니다.')).toBeVisible();

    await userEvent.click(body.getByRole('button', { name: '다시 시도' }));
    await expect(
      canvas.findByText('다시 시도한 뒤 추가된 로컬 게시글입니다.'),
    ).resolves.toBeVisible();
    expect(canvas.getByText('첫 페이지에 남아 있는 로컬 게시글입니다.')).toBeVisible();
    await waitFor(() => expect(body.queryByRole('alert')).not.toBeInTheDocument());
    storyWindow.scrollTo(0, 0);
  },
};

export const RefreshQuery: Story = {
  ...refreshing,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const retainedPost = '같은 인스턴스의 소식을 한곳에서 확인해요.';
    await expect(canvas.findByText(retainedPost)).resolves.toBeVisible();
    const tab = canvas.getByRole('tab', { name: '로컬' });
    await userEvent.click(tab);
    await waitFor(() => expect(queryRequestObserver).toHaveBeenCalledTimes(2));
    expect(
      canvas.queryByText('새로고침에 성공한 뒤 다시 표시된 로컬 게시글입니다.'),
    ).not.toBeInTheDocument();
    expect(
      canvas.queryByRole('progressbar', { name: '로컬 타임라인을 새로고침하는 중' }),
    ).not.toBeInTheDocument();
    await userEvent.click(tab);
    expect(queryRequestObserver).toHaveBeenCalledTimes(2);
    await expect(
      canvas.findByText(
        '새로고침에 성공한 뒤 다시 표시된 로컬 게시글입니다.',
        {},
        { timeout: 5_000 },
      ),
    ).resolves.toBeVisible();
  },
};

export const PaginationProgress: Story = {
  ...paginationFlow,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const storyWindow = canvasElement.ownerDocument.defaultView!;
    storyWindow.scrollTo(0, 0);
    await expect(canvas.findByText('스크롤로 확인하는 로컬 게시글 1')).resolves.toBeVisible();
    expect(canvas.queryByRole('progressbar')).not.toBeInTheDocument();
    scrollStoryToEnd(canvasElement);
    await expect(
      canvas.findByRole('progressbar', { name: '게시글을 더 불러오는 중' }),
    ).resolves.toBeVisible();
    expect(canvas.getByText('스크롤로 확인하는 로컬 게시글 20')).toBeVisible();
    await expect(
      canvas.findByText('다음 페이지에서 추가된 로컬 게시글입니다.', {}, { timeout: 5_000 }),
    ).resolves.toBeVisible();
    expect(canvas.getByText('스크롤로 확인하는 로컬 게시글 1')).toBeInTheDocument();
    expect(canvas.queryByRole('progressbar')).not.toBeInTheDocument();
    storyWindow.scrollTo(0, 0);
  },
};
