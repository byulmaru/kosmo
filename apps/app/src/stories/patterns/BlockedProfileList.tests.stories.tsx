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

export const SuccessContract: Story = {
  play: async ({ args, canvasElement }) => {
    args.onDismiss.mockClear();
    args.onFeedback.mockClear();
    args.onLoadMore.mockClear();
    args.onRetry.mockClear();
    args.onUnblock.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const title = '이 프로필의 차단을 해제할까요?';
    const firstAction = canvas.getByRole('button', { name: `${args.displayName} 차단 해제` });

    await userEvent.click(firstAction);
    const dialog = await body.findByRole('dialog', { name: title });
    expect(args.onUnblock).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: '차단 해제' }));
    await waitFor(() => expect(args.onUnblock).toHaveBeenCalledWith('kosmo'));
    await waitFor(() =>
      expect(args.onFeedback).toHaveBeenCalledWith({
        blocked: false,
        profileId: 'kosmo',
        status: 'success',
      }),
    );
    await waitFor(() => expect(canvas.queryByText(args.displayName)).not.toBeInTheDocument());
    await waitFor(() =>
      expect(canvas.getByRole('heading', { name: '차단한 프로필' })).toHaveFocus(),
    );

    const secondAction = canvas.getByRole('button', { name: '은하 관측자 차단 해제' });
    await userEvent.click(secondAction);
    await userEvent.click(await body.findByRole('button', { name: '차단 해제' }));
    await waitFor(() => expect(args.onUnblock).toHaveBeenCalledWith('galaxy'));
    await waitFor(() => expect(canvas.queryByText('은하 관측자')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(canvas.getByRole('heading', { name: '차단한 프로필' })).toHaveFocus(),
    );
  },
};

export const LastRowRemovalFocusContract: Story = {
  play: async ({ args, canvasElement }) => {
    args.onDismiss.mockClear();
    args.onFeedback.mockClear();
    args.onLoadMore.mockClear();
    args.onRetry.mockClear();
    args.onUnblock.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole('button', { name: '은하 관측자 차단 해제' }));
    await userEvent.click(await body.findByRole('button', { name: '차단 해제' }));
    await waitFor(() => expect(args.onUnblock).toHaveBeenCalledWith('galaxy'));
    await waitFor(() =>
      expect(args.onFeedback).toHaveBeenCalledWith({
        blocked: false,
        profileId: 'galaxy',
        status: 'success',
      }),
    );
    expect(canvas.getByText(args.displayName)).toBeVisible();
    expect(canvas.queryByText('은하 관측자')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(canvas.getByRole('heading', { name: '차단한 프로필' })).toHaveFocus(),
    );
  },
};

export const FailureContract: Story = {
  args: { outcome: 'error' },
  play: async ({ args, canvasElement }) => {
    args.onDismiss.mockClear();
    args.onFeedback.mockClear();
    args.onLoadMore.mockClear();
    args.onRetry.mockClear();
    args.onUnblock.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const title = '이 프로필의 차단을 해제할까요?';
    const action = canvas.getByRole('button', { name: `${args.displayName} 차단 해제` });

    await userEvent.click(action);
    await userEvent.click(await body.findByRole('button', { name: '차단 해제' }));
    await waitFor(() => expect(args.onUnblock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(args.onFeedback).toHaveBeenCalledWith({
        blocked: false,
        profileId: 'kosmo',
        status: 'error',
      }),
    );
    expect(await body.findByText('차단을 해제하지 못했어요. 다시 시도해 주세요.')).toBeVisible();
    expect(body.queryByRole('dialog', { name: title })).not.toBeInTheDocument();
    expect(canvas.getByText(args.displayName)).toBeVisible();
    await waitFor(() => expect(action).toHaveFocus());

    await userEvent.click(action);
    await userEvent.click(await body.findByRole('button', { name: '차단 해제' }));
    await waitFor(() => expect(args.onUnblock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(args.onFeedback).toHaveBeenCalledTimes(2));
    expect(canvas.getByText(args.displayName)).toBeVisible();
    await waitFor(() => expect(action).toHaveFocus());

    await userEvent.click(action);
    await userEvent.click(await body.findByRole('button', { name: '취소' }));
    await waitFor(() => expect(args.onDismiss).toHaveBeenCalledWith('kosmo'));
    await waitFor(() => expect(action).toHaveFocus());
  },
};

export const InitialRetryContract: Story = {
  args: { state: 'error' },
  play: async ({ args, canvasElement }) => {
    args.onDismiss.mockClear();
    args.onFeedback.mockClear();
    args.onLoadMore.mockClear();
    args.onRetry.mockClear();
    args.onUnblock.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const toast = await body.findByRole('alert');
    expect(within(toast).getByText('차단한 프로필을 불러오지 못했어요')).toBeVisible();
    expect(
      canvas.getByRole('heading', { name: '차단한 프로필' }).parentElement?.contains(toast),
    ).toBe(false);
    await userEvent.click(within(toast).getByRole('button', { name: '다시 시도' }));
    expect(args.onRetry).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(body.queryByRole('alert')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(canvas.getByRole('heading', { name: '차단한 프로필' })).toHaveFocus(),
    );
    expect(await canvas.findByText(args.displayName)).toBeVisible();
    expect(canvas.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
  },
};

export const PaginationRetryContract: Story = {
  args: { state: 'loadMoreError' },
  play: async ({ args, canvasElement }) => {
    args.onDismiss.mockClear();
    args.onFeedback.mockClear();
    args.onLoadMore.mockClear();
    args.onRetry.mockClear();
    args.onUnblock.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const toast = await body.findByRole('alert');
    expect(within(toast).getByText('프로필을 더 불러오지 못했어요')).toBeVisible();
    expect(
      canvas.getByRole('heading', { name: '차단한 프로필' }).parentElement?.contains(toast),
    ).toBe(false);
    await userEvent.click(within(toast).getByRole('button', { name: '다시 시도' }));
    expect(args.onRetry).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(body.queryByRole('alert')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(canvas.getByRole('heading', { name: '차단한 프로필' })).toHaveFocus(),
    );
    await waitFor(() =>
      expect(canvas.queryByText('프로필을 더 불러오는 중입니다.')).not.toBeInTheDocument(),
    );
    expect(canvas.getByText(args.displayName)).toBeVisible();
    expect(canvas.queryByRole('button', { name: '더 불러오기' })).not.toBeInTheDocument();
  },
};

export const LoadMoreContract: Story = {
  play: async ({ args, canvasElement }) => {
    args.onDismiss.mockClear();
    args.onFeedback.mockClear();
    args.onLoadMore.mockClear();
    args.onRetry.mockClear();
    args.onUnblock.mockClear();
    const canvas = within(canvasElement);
    await userEvent.click(within(canvasElement).getByRole('button', { name: '더 불러오기' }));
    expect(args.onLoadMore).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(canvas.getByText('프로필을 더 불러오는 중입니다.')).toBeVisible());
    await waitFor(() =>
      expect(canvas.queryByText('프로필을 더 불러오는 중입니다.')).not.toBeInTheDocument(),
    );
    expect(canvas.queryByRole('button', { name: '더 불러오기' })).not.toBeInTheDocument();
    expect(canvas.getByText('코스모 작가')).toBeVisible();
  },
};
