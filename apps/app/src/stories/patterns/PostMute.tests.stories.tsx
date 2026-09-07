import { expect, userEvent, waitFor, within } from 'storybook/test';
import baseMeta from './PostMute.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/Post/Mute/Tests',
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const MuteContract: Story = {
  play: async ({ args, canvasElement }) => {
    args.onMute.mockClear();
    args.onUnmute.mockClear();
    args.onFeedback.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '더보기' });
    await userEvent.click(trigger);
    expect(await body.findByRole('menuitem', { name: '링크 복사' })).toBeVisible();
    const menu = body.getByRole('menu', { name: '더보기' });
    await waitFor(() =>
      expect(
        Math.abs(menu.getBoundingClientRect().right - trigger.getBoundingClientRect().right),
      ).toBeLessThanOrEqual(5),
    );
    await userEvent.click(await body.findByRole('menuitem', { name: '뮤트' }));
    const cancel = await body.findByRole('button', { name: '취소' });
    await waitFor(() => expect(cancel).toHaveFocus());
    await userEvent.click(cancel);
    expect(args.onMute).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '뮤트' }));
    await userEvent.click(await body.findByRole('button', { name: '뮤트' }));
    await waitFor(() =>
      expect(args.onFeedback).toHaveBeenCalledWith({ muted: true, status: 'success' }),
    );
    expect(args.onMute).toHaveBeenCalledTimes(1);
    expect(await body.findByText('코스모 작가 님이 뮤트되었어요')).toBeVisible();
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    expect(await body.findByRole('menuitem', { name: '뮤트 해제' })).toBeVisible();
    await userEvent.keyboard('{Escape}');
  },
};
export const FailureContract: Story = {
  args: { outcome: 'error' },
  play: async ({ args, canvasElement }) => {
    args.onMute.mockClear();
    args.onFeedback.mockClear();
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: '더보기' }));
    await userEvent.click(await body.findByRole('menuitem', { name: '뮤트' }));
    await userEvent.click(await body.findByRole('button', { name: '뮤트' }));
    await waitFor(() =>
      expect(args.onFeedback).toHaveBeenCalledWith({ muted: true, status: 'error' }),
    );
    expect(await body.findByText('뮤트하지 못했어요. 다시 시도해 주세요.')).toBeVisible();
    expect(body.queryByRole('dialog')).not.toBeInTheDocument();
    const trigger = within(canvasElement).getByRole('button', { name: '더보기' });
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '뮤트' }));
    await userEvent.click(await body.findByRole('button', { name: '뮤트' }));
    await waitFor(() => expect(args.onMute).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(args.onFeedback).toHaveBeenCalledTimes(2));
    expect(body.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
export const PendingContract: Story = {
  args: { outcome: 'pending' },
  play: async ({ args, canvasElement }) => {
    args.onMute.mockClear();
    args.onFeedback.mockClear();
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: '더보기' }));
    await userEvent.click(await body.findByRole('menuitem', { name: '뮤트' }));
    const confirm = await body.findByRole('button', { name: '뮤트' });
    await userEvent.click(confirm);
    await waitFor(() => expect(confirm).toHaveAttribute('aria-busy', 'true'));
    expect(body.getByRole('button', { name: '취소' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Escape}');
    expect(confirm).toBeVisible();
    expect(args.onMute).toHaveBeenCalledTimes(1);
    expect(args.onFeedback).not.toHaveBeenCalled();
  },
};
export const UnmuteContract: Story = {
  args: { muted: true },
  play: async ({ args, canvasElement }) => {
    args.onUnmute.mockClear();
    args.onFeedback.mockClear();
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: '더보기' }));
    await userEvent.click(await body.findByRole('menuitem', { name: '뮤트 해제' }));
    expect(args.onUnmute).not.toHaveBeenCalled();
    await userEvent.click(await body.findByRole('button', { name: '뮤트 해제' }));
    await waitFor(() =>
      expect(args.onFeedback).toHaveBeenCalledWith({ muted: false, status: 'success' }),
    );
    expect(args.onUnmute).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(within(canvasElement).getByRole('button', { name: '더보기' })).toHaveFocus(),
    );
    expect(body.queryByText('이 프로필을 뮤트할까요?')).not.toBeInTheDocument();
  },
};
