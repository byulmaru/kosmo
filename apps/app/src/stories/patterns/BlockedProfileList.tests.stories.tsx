import { expect, userEvent, waitFor, within } from 'storybook/test';
import baseMeta from './BlockedProfileList.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/Profile/Blocked Profiles/Tests',
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const RowComposition: Story = {
  globals: { viewport: { value: 'kosmoMobile', isRotated: false } },
  play: async ({ args, canvasElement }) => {
    args.onSelectAction.mockClear();
    const canvas = within(canvasElement);
    const action = canvas.getByRole('button', { name: `${args.displayName} 차단 해제` });
    expect(action.getBoundingClientRect().width).toBe(96);
    expect(action.getBoundingClientRect().height).toBe(40);
    await userEvent.click(action);
    expect(args.onSelectAction).toHaveBeenCalledWith('kosmo');
    expect(canvas.getByText(args.displayName)).toBeVisible();
  },
};

export const InitialRetry: Story = {
  args: { state: 'error' },
  play: async ({ args, canvasElement }) => {
    args.onRetry.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const toast = await body.findByRole('alert');
    expect(within(toast).getByText('차단한 프로필을 불러오지 못했어요')).toBeVisible();
    await userEvent.click(within(toast).getByRole('button', { name: '다시 시도' }));
    expect(args.onRetry).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(canvas.getByRole('heading', { name: '차단한 프로필' })).toHaveFocus(),
    );
    expect(await canvas.findByText(args.displayName)).toBeVisible();
  },
};

export const PaginationRetryAfterToast: Story = {
  args: { state: 'loadMoreError' },
  play: async ({ args, canvasElement }) => {
    args.onRetry.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await body.findByRole('alert');
    await waitFor(() => expect(body.queryByRole('alert')).not.toBeInTheDocument(), {
      timeout: 5000,
    });
    expect(canvas.getByText(args.displayName)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '더 불러오기' }));
    expect(args.onRetry).toHaveBeenCalledTimes(1);
    expect(canvas.queryByRole('button', { name: '더 불러오기' })).not.toBeInTheDocument();
    expect(canvas.getByText('은하 관측자')).toBeVisible();
  },
};

export const LoadMore: Story = {
  play: async ({ args, canvasElement }) => {
    args.onLoadMore.mockClear();
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '더 불러오기' }));
    expect(args.onLoadMore).toHaveBeenCalledTimes(1);
    expect(canvas.queryByRole('button', { name: '더 불러오기' })).not.toBeInTheDocument();
  },
};
