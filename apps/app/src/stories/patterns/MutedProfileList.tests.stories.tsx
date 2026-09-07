import { expect, userEvent, waitFor, within } from 'storybook/test';
import { breakpoints } from '@/theme/tokens';
import baseMeta, {
  FailureContract as failure,
  Mobile as mobile,
  PaginationContract as pagination,
  PendingContract as pending,
  RetryContract as retry,
  UnmuteContract as unmute,
} from './MutedProfileList.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/Profile/Muted Profiles/Tests',
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const TargetGeometryContract: Story = {
  ...mobile,
  play: async ({ args, canvasElement }) => {
    await waitFor(() => {
      const rect = within(canvasElement)
        .getByRole('button', { name: `${args.displayName} 뮤트 해제` })
        .getBoundingClientRect();
      const mobileViewport =
        canvasElement.ownerDocument.documentElement.clientWidth < breakpoints.compact;
      expect(rect.width).toBe(mobileViewport ? 88 : 72);
      expect(rect.height).toBe(mobileViewport ? 40 : 32);
    });
  },
};

export const UnmuteContract: Story = {
  ...unmute,
  play: async ({ args, canvasElement }) => {
    args.onUnmute.mockClear();
    args.onFeedback.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const title = '이 프로필을 뮤트 해제할까요?';
    const rowAction = canvas.getByRole('button', {
      name: `${args.displayName} 뮤트 해제`,
    });

    await userEvent.click(rowAction);
    const dialog = await body.findByRole('dialog', { name: title });
    const cancel = within(dialog).getByRole('button', { name: '취소' });
    await waitFor(() => expect(cancel).toHaveFocus());
    expect(args.onUnmute).not.toHaveBeenCalled();
    expect(args.onFeedback).not.toHaveBeenCalled();
    expect(canvas.getByText(args.displayName)).toBeVisible();

    await userEvent.click(cancel);
    await waitFor(() =>
      expect(body.queryByRole('dialog', { name: title })).not.toBeInTheDocument(),
    );
    expect(canvas.getByText(args.displayName)).toBeVisible();
    await waitFor(() => expect(rowAction).toHaveFocus());

    await userEvent.click(rowAction);
    const reopened = await body.findByRole('dialog', { name: title });
    await userEvent.click(within(reopened).getByRole('button', { name: '뮤트 해제' }));
    await waitFor(() => expect(args.onUnmute).toHaveBeenCalledWith('kosmo'));
    await waitFor(() =>
      expect(body.queryByRole('dialog', { name: title })).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(args.onFeedback).toHaveBeenCalledWith({
        profileId: 'kosmo',
        muted: false,
        status: 'success',
      }),
    );
    await waitFor(() => expect(canvas.queryByText(args.displayName)).not.toBeInTheDocument());
    await waitFor(() =>
      expect(canvas.getByRole('heading', { name: '뮤트한 프로필' })).toHaveFocus(),
    );
    expect(canvas.getByText('은하 관측자')).toBeVisible();
  },
};

export const FailureContract: Story = {
  ...failure,
  play: async ({ args, canvasElement }) => {
    args.onUnmute.mockClear();
    args.onFeedback.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const title = '이 프로필을 뮤트 해제할까요?';

    await userEvent.click(canvas.getByRole('button', { name: `${args.displayName} 뮤트 해제` }));
    const dialog = await body.findByRole('dialog', { name: title });
    const confirm = within(dialog).getByRole('button', { name: '뮤트 해제' });
    await userEvent.click(confirm);
    await waitFor(() => expect(args.onUnmute).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(args.onFeedback).toHaveBeenCalledWith({
        profileId: 'kosmo',
        muted: false,
        status: 'error',
      }),
    );
    await waitFor(() =>
      expect(body.queryByRole('dialog', { name: title })).not.toBeInTheDocument(),
    );
    expect(await body.findByText('뮤트를 해제하지 못했어요. 다시 시도해 주세요.')).toBeVisible();
    expect(canvas.getByText(args.displayName)).toBeVisible();
    const rowAction = canvas.getByRole('button', { name: `${args.displayName} 뮤트 해제` });
    await waitFor(() => expect(rowAction).toHaveFocus());

    await userEvent.click(rowAction);
    const reopened = await body.findByRole('dialog', { name: title });
    await userEvent.click(within(reopened).getByRole('button', { name: '뮤트 해제' }));
    await waitFor(() => expect(args.onUnmute).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(args.onFeedback).toHaveBeenCalledTimes(2));
    expect(body.queryByRole('dialog', { name: title })).not.toBeInTheDocument();
    expect(canvas.getByText(args.displayName)).toBeVisible();
    await waitFor(() => expect(rowAction).toHaveFocus());
  },
};

export const PendingContract: Story = {
  ...pending,
  play: async ({ args, canvasElement }) => {
    args.onUnmute.mockClear();
    args.onFeedback.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const title = '이 프로필을 뮤트 해제할까요?';

    await userEvent.click(canvas.getByRole('button', { name: `${args.displayName} 뮤트 해제` }));
    const dialog = await body.findByRole('dialog', { name: title });
    const confirm = within(dialog).getByRole('button', { name: '뮤트 해제' });
    await userEvent.click(confirm);
    await waitFor(() => expect(args.onUnmute).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(confirm).toHaveAttribute('aria-disabled', 'true'));
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(within(dialog).getByRole('button', { name: '취소' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(within(dialog).getByRole('button', { name: '닫기' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(args.onFeedback).not.toHaveBeenCalled();

    confirm.focus();
    await userEvent.keyboard('{Enter}');
    expect(args.onUnmute).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Escape}');
    expect(dialog).toBeVisible();
    expect(canvas.getByText(args.displayName)).toBeVisible();
    expect(args.onFeedback).not.toHaveBeenCalled();
  },
};

export const RetryContract: Story = {
  ...retry,
  play: async ({ args, canvasElement }) => {
    args.onRetry.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const toast = await body.findByRole('alert');
    expect(within(toast).getByText('뮤트한 프로필을 불러오지 못했어요')).toBeVisible();
    expect(
      canvas.getByRole('heading', { name: '뮤트한 프로필' }).parentElement?.contains(toast),
    ).toBe(false);
    await userEvent.click(within(toast).getByRole('button', { name: '다시 시도' }));
    expect(args.onRetry).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(body.queryByRole('alert')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(canvas.getByRole('heading', { name: '뮤트한 프로필' })).toHaveFocus(),
    );
    await userEvent.click(canvas.getByRole('button', { name: '다시 시도' }));
    expect(args.onRetry).toHaveBeenCalledTimes(2);
  },
};

export const PaginationContract: Story = {
  ...pagination,
  play: async ({ args, canvasElement }) => {
    args.onLoadMore.mockClear();
    await userEvent.click(within(canvasElement).getByRole('button', { name: '더 불러오기' }));
    expect(args.onLoadMore).toHaveBeenCalledTimes(1);
  },
};

export const LoadMoreFailureContract: Story = {
  args: { state: 'loadMoreError' },
  play: async ({ args, canvasElement }) => {
    args.onRetry.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const toast = await body.findByRole('alert');
    expect(within(toast).getByText('프로필을 더 불러오지 못했어요')).toBeVisible();
    expect(
      canvas.getByRole('heading', { name: '뮤트한 프로필' }).parentElement?.contains(toast),
    ).toBe(false);
    expect(canvas.getByText(args.displayName)).toBeVisible();
    expect(canvas.getByText('은하 관측자')).toBeVisible();
    await userEvent.click(within(toast).getByRole('button', { name: '다시 시도' }));
    expect(args.onRetry).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(body.queryByRole('alert')).not.toBeInTheDocument());
    await userEvent.click(canvas.getByRole('button', { name: '더 불러오기' }));
    expect(args.onRetry).toHaveBeenCalledTimes(2);
  },
};
