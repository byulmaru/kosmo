import { expect, userEvent, waitFor, within } from 'storybook/test';
import baseMeta, {
  InitialErrorActorCleanup as initialErrorActorCleanup,
  InitialErrorRetry as initialErrorRetry,
  queryRequestObserver,
} from './FollowRequests.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Screens/Follow Requests/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const InitialErrorRetry: Story = {
  ...initialErrorRetry,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const alert = await body.findByRole('alert');

    expect(alert).toHaveTextContent('팔로워 요청을 불러오지 못했어요');
    expect(canvas.getByRole('heading', { name: '팔로워 요청' })).toBeVisible();
    expect(canvas.queryByText('팔로워 요청을 불러오는 중입니다.')).not.toBeInTheDocument();
    await waitFor(() => expect(queryRequestObserver).toHaveBeenCalledTimes(1));

    await userEvent.dblClick(within(alert).getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(queryRequestObserver).toHaveBeenCalledTimes(2));
    const retryAlert = await body.findByRole('alert');
    expect(retryAlert).toHaveTextContent('팔로워 요청을 불러오지 못했어요');

    await userEvent.click(within(retryAlert).getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(queryRequestObserver).toHaveBeenCalledTimes(3));
    await expect(
      canvas.findByRole('link', { name: '별빛 여행자 프로필로 이동' }),
    ).resolves.toBeVisible();
    expect(body.queryByRole('alert')).not.toBeInTheDocument();
  },
};

export const InitialErrorActorCleanup: Story = {
  ...initialErrorActorCleanup,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.findByRole('alert')).resolves.toHaveTextContent(
      '팔로워 요청을 불러오지 못했어요',
    );

    await userEvent.click(canvas.getByRole('button', { name: '프로필 전환' }));
    await expect(
      canvas.findByRole('link', { name: '은하 기록자 프로필로 이동' }),
    ).resolves.toBeVisible();
    expect(body.queryByRole('alert')).not.toBeInTheDocument();
  },
};
