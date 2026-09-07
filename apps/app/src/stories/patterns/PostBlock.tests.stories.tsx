import { expect, userEvent, waitFor, within } from 'storybook/test';
import baseMeta from './PostBlock.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/Post/Block/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const BlockContract: Story = {
  play: async ({ args, canvasElement }) => {
    args.onBlock.mockClear();
    args.onBlockDismiss.mockClear();
    args.onBlockFeedback.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const actionBar = canvas.getByRole('toolbar', { name: '액션 바' });
    const trigger = within(actionBar).getByRole('button', { name: '더보기' });

    for (const dismiss of ['Escape', '취소', '닫기']) {
      await userEvent.click(trigger);
      await userEvent.click(await body.findByRole('menuitem', { name: '차단' }));
      const confirmation = await body.findByRole('dialog', { name: '이 프로필을 차단할까요?' });
      await waitFor(() =>
        expect(within(confirmation).getByRole('button', { name: '취소' })).toHaveFocus(),
      );
      if (dismiss === 'Escape') {
        await userEvent.keyboard('{Escape}');
      } else {
        await userEvent.click(within(confirmation).getByRole('button', { name: dismiss }));
      }
      await waitFor(() => expect(trigger).toHaveFocus());
      expect(body.queryByRole('dialog')).not.toBeInTheDocument();
      expect(args.onBlock).not.toHaveBeenCalled();
      expect(args.onBlockFeedback).not.toHaveBeenCalled();
    }
    expect(args.onBlockDismiss).toHaveBeenCalledTimes(3);

    await userEvent.click(trigger);
    expect((await body.findAllByRole('menuitem')).map((item) => item.textContent?.trim())).toEqual([
      '링크 복사',
      '뮤트',
      '차단',
    ]);
    await userEvent.click(body.getByRole('menuitem', { name: '차단' }));
    const dialog = await body.findByRole('dialog', { name: '이 프로필을 차단할까요?' });
    expect(
      within(dialog).getByText(
        '서로의 프로필과 게시물을 볼 수 없게 되고, 팔로우 관계와 요청이 삭제돼요.',
      ),
    ).toBeVisible();
    expect(args.onBlock).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: '차단' }));
    await waitFor(() => expect(args.onBlock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(args.onBlockFeedback).toHaveBeenCalledWith({ blocked: true, status: 'success' }),
    );
    expect(await canvas.findByText('게시물을 볼 수 없습니다')).toBeVisible();
    await waitFor(() => expect(canvas.getByTestId('post-blocked-surface')).toHaveFocus());
    expect(args.onBlockDismiss).toHaveBeenCalledTimes(3);
    expect(canvas.queryByText('코스모 작가')).not.toBeInTheDocument();
    expect(canvas.queryByText('오늘 발견한 작은 별의 이야기를 나눠요.')).not.toBeInTheDocument();
    expect(await body.findByText('코스모 작가 님이 차단되었어요')).toBeVisible();
  },
};

export const FailureContract: Story = {
  args: { outcome: 'error' },
  play: async ({ args, canvasElement }) => {
    args.onBlock.mockClear();
    args.onBlockFeedback.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = within(canvas.getByRole('toolbar', { name: '액션 바' })).getByRole('button', {
      name: '더보기',
    });

    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '차단' }));
    await userEvent.click(await body.findByRole('button', { name: '차단' }));
    await waitFor(() => expect(args.onBlock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(args.onBlockFeedback).toHaveBeenCalledWith({ blocked: true, status: 'error' }),
    );
    expect(await body.findByText('차단하지 못했어요. 다시 시도해 주세요.')).toBeVisible();
    expect(body.queryByRole('dialog', { name: '이 프로필을 차단할까요?' })).not.toBeInTheDocument();
    expect(canvas.getByText('오늘 발견한 작은 별의 이야기를 나눠요.')).toBeVisible();
    await waitFor(() => expect(trigger).toHaveFocus());

    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '차단' }));
    await userEvent.click(await body.findByRole('button', { name: '차단' }));
    await waitFor(() => expect(args.onBlock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(args.onBlockFeedback).toHaveBeenCalledTimes(2));
    expect(canvas.getByText('오늘 발견한 작은 별의 이야기를 나눠요.')).toBeVisible();
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

export const PendingContract: Story = {
  args: { outcome: 'pending' },
  play: async ({ args, canvasElement }) => {
    args.onBlock.mockClear();
    args.onBlockFeedback.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = within(canvas.getByRole('toolbar', { name: '액션 바' })).getByRole('button', {
      name: '더보기',
    });

    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '차단' }));
    const confirm = await body.findByRole('button', { name: '차단' });
    await userEvent.click(confirm);
    await waitFor(() => expect(confirm).toHaveAttribute('aria-busy', 'true'));
    expect(body.getByRole('button', { name: '취소' })).toHaveAttribute('aria-disabled', 'true');
    expect(body.getByRole('button', { name: '닫기' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Escape}');
    expect(confirm).toBeVisible();
    expect(args.onBlock).toHaveBeenCalledTimes(1);
    expect(args.onBlockFeedback).not.toHaveBeenCalled();
    expect(canvas.getByText('오늘 발견한 작은 별의 이야기를 나눠요.')).toBeVisible();
  },
};

export const SelfAuthorGuard: Story = {
  parameters: {
    relay: {
      data: {
        ...baseMeta.parameters.relay.data,
        currentSession: { id: 'block-self-session', selectedProfile: { id: 'block-author' } },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const actionBar = canvas.getByRole('toolbar', { name: '액션 바' });
    await userEvent.click(within(actionBar).getByRole('button', { name: '더 보기' }));
    const body = within(canvasElement.ownerDocument.body);
    expect(await body.findByRole('menuitem', { name: '링크 복사' })).toBeVisible();
    expect(body.queryByRole('menuitem', { name: '뮤트' })).not.toBeInTheDocument();
    expect(body.queryByRole('menuitem', { name: '차단' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
  },
};

export const MismatchedTargetGuard: Story = {
  args: { blockProfileId: 'another-profile' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const actionBar = canvas.getByRole('toolbar', { name: '액션 바' });
    await userEvent.click(within(actionBar).getByRole('button', { name: '더보기' }));
    const body = within(canvasElement.ownerDocument.body);
    expect(await body.findByRole('menuitem', { name: '링크 복사' })).toBeVisible();
    expect(await body.findByRole('menuitem', { name: '뮤트' })).toBeVisible();
    expect(body.queryByRole('menuitem', { name: '차단' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
  },
};

export const MissingSelectedProfileGuard: Story = {
  parameters: {
    relay: {
      data: {
        ...baseMeta.parameters.relay.data,
        currentSession: { id: 'block-guest-session', selectedProfile: null },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const actionBar = canvas.getByRole('toolbar', { name: '액션 바' });
    await userEvent.click(within(actionBar).getByRole('button', { name: '더 보기' }));
    const body = within(canvasElement.ownerDocument.body);
    expect(await body.findByRole('menuitem', { name: '링크 복사' })).toBeVisible();
    expect(body.queryByRole('menuitem', { name: '뮤트' })).not.toBeInTheDocument();
    expect(body.queryByRole('menuitem', { name: '차단' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
  },
};
