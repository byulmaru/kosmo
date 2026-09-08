import { useRef, useState } from 'react';
import { View } from 'react-native';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '@/components/ui/Button';
import { semanticColors } from '@/theme/tokens';
import baseMeta, { ProfileHeroFixture } from './ProfileHero.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps } from 'react';

const meta = {
  ...baseMeta,
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/ProfileHero/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function getTriggerVisual(trigger: HTMLElement) {
  const visual = trigger.firstElementChild;
  expect(visual).toBeInstanceOf(HTMLElement);
  return visual as HTMLElement;
}

function LateCompletionFixture({
  onBlock,
  onBlockFeedback,
}: Pick<ComponentProps<typeof ProfileHeroFixture>, 'onBlock' | 'onBlockFeedback'>) {
  const [profileId, setProfileId] = useState('profile-hero-default');
  const staleCompletion = useRef<(() => void) | null>(null);
  const [settled, setSettled] = useState(false);

  return (
    <View style={{ gap: 12, padding: 24 }}>
      <ProfileHeroFixture
        onBlock={async () => {
          await onBlock();
          if (profileId === 'profile-hero-default') {
            const completion = new Promise<void>((resolve) => {
              staleCompletion.current = resolve;
            });
            setProfileId('profile-hero-images');
            await completion;
            setSettled(true);
          }
        }}
        onBlockFeedback={onBlockFeedback}
        profileId={profileId}
      />
      <Button onPress={() => staleCompletion.current?.()} tone="secondary">
        {settled ? '이전 요청 완료됨' : '이전 요청 완료'}
      </Button>
    </View>
  );
}

export const MobileFollowError: Story = {
  args: { containerWidth: 390 },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: { relay: { mutationError: '팔로우 실패' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole('button', { name: '팔로우' });
    const surface = canvas.getByTestId('profile-hero-surface');
    await userEvent.click(button);
    const alert = await within(canvasElement.ownerDocument.body).findByRole('alert');
    expect(surface.contains(alert)).toBe(false);
    expect(alert).toHaveTextContent('팔로우 상태를 변경하지 못했습니다.');
    expect(button).toBeEnabled();
  },
};

const maxLengthTag = '가'.repeat(20);

export const CenterGeometryContract: Story = {
  args: { actionSize: 'medium' },
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const moreButton = canvas.getByRole('button', { name: '더보기' });
    const moreRect = getTriggerVisual(moreButton).getBoundingClientRect();
    const followButton = canvas.getByRole('button', { name: '팔로우' });
    const followRect = followButton.getBoundingClientRect();
    expect(moreRect.height).toBe(40);
    expect(moreRect.width).toBe(40);
    expect(followRect.height).toBe(40);
    expect(followRect.width).toBe(96);
    expect(followRect.left - moreRect.right).toBeCloseTo(16, 0);
    expect(followRect.top).toBeCloseTo(moreRect.top, 0);
    expect(canvas.getByRole('heading', { name: '프로필 히어로' })).toBeVisible();
    expect(canvas.getByRole('link', { name: /팔로잉/ })).toHaveAttribute(
      'href',
      '/@profile-hero/following',
    );
    expect(canvas.getByRole('link', { name: /팔로워/ })).toHaveAttribute(
      'href',
      '/@profile-hero/followers',
    );
  },
};

export const MobileGeometryContract: Story = {
  args: { containerWidth: 390 },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const moreButton = canvas.getByRole('button', { name: '더보기' });
    const moreRect = getTriggerVisual(moreButton).getBoundingClientRect();
    const followButton = canvas.getByRole('button', { name: '팔로우' });
    const followRect = followButton.getBoundingClientRect();
    expect(moreRect.height).toBe(40);
    expect(moreRect.width).toBe(40);
    expect(followRect.height).toBe(40);
    expect(followRect.width).toBe(96);
    expect(followRect.left - moreRect.right).toBeCloseTo(16, 0);
    expect(followRect.top).toBeCloseTo(moreRect.top, 0);
    expect(canvas.getByTestId('profile-hero-surface').getBoundingClientRect().width).toBe(390);
    expect(canvas.getByLabelText('프로필 히어로 프로필 이미지')).toBeVisible();
  },
};

export const LoadingGeometryContract: Story = {
  args: { actionSize: 'medium', loading: true, showAction: true },
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const followButton = canvas.getByRole('button', { name: '팔로우' });
    expect(followButton.getBoundingClientRect().height).toBe(40);
    expect(followButton.getBoundingClientRect().width).toBe(96);
    expect(canvas.getByText('프로필을 불러오는 중입니다.')).toBeInTheDocument();
  },
};

export const ImageAndTagsContract: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  args: { containerWidth: 240, profileId: 'profile-hero-long-tags', showAction: false },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('#공예')).toBeInTheDocument();
    expect(canvas.getByText('#사진')).toBeInTheDocument();
    expect(canvas.getByText('#아주긴프로필태그이름입니다')).toBeInTheDocument();
    expect(canvas.getByText(`#${maxLengthTag}`)).toBeInTheDocument();
    const tagList = canvas.getByTestId('profile-tag-list');
    const chips = within(tagList).getAllByTestId('profile-tag-chip');
    expect(chips).toHaveLength(6);
    expect(
      new Set(chips.map((chip) => Math.round(chip.getBoundingClientRect().top))).size,
    ).toBeGreaterThan(1);
    expect(tagList.scrollWidth).toBeLessThanOrEqual(tagList.clientWidth + 1);
    const maxLengthText = within(tagList).getByText(`#${maxLengthTag}`);
    const maxLengthLink = within(tagList).getByRole('link', {
      name: `#${maxLengthTag} 관련 프로필 보기`,
    });
    expect(maxLengthLink.getBoundingClientRect().height).toBe(32);
    expect(maxLengthLink.getBoundingClientRect().width).toBeGreaterThanOrEqual(32);
    expect(getComputedStyle(maxLengthText).whiteSpace).toBe('nowrap');
    expect(getComputedStyle(maxLengthText).textOverflow).toBe('ellipsis');
    expect(getComputedStyle(maxLengthText).overflow).toBe('hidden');
    expect(maxLengthText.scrollWidth).toBeGreaterThan(maxLengthText.clientWidth);
    for (const chip of chips) {
      expect(chip.getBoundingClientRect().height).toBe(32);
      expect(chip.getBoundingClientRect().right).toBeLessThanOrEqual(
        tagList.getBoundingClientRect().right + 1,
      );
    }
    expect(canvas.getByRole('link', { name: '#공예 관련 프로필 보기' })).toHaveAttribute(
      'href',
      '/hashtags/[hashtagId]/profiles',
    );
  },
};

export const MuteContract: Story = {
  args: { muted: true },
  play: async ({ args, canvasElement }) => {
    args.onUnmute?.mockClear();
    const canvas = within(canvasElement);
    expect(canvas.getByText('이 사용자의 게시글은 뮤트되어 있습니다.')).toBeVisible();
    expect(canvas.getByRole('button', { name: '팔로우' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '뮤트 해제' }));
    const body = within(canvasElement.ownerDocument.body);
    expect(args.onUnmute).not.toHaveBeenCalled();
    const dialog = await body.findByRole('dialog', { name: '이 프로필을 뮤트 해제할까요?' });
    await userEvent.click(within(dialog).getByRole('button', { name: '뮤트 해제' }));
    await waitFor(() => expect(args.onUnmute).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(canvas.queryByText('이 사용자의 게시글은 뮤트되어 있습니다.')).not.toBeInTheDocument(),
    );
    expect(canvas.getByRole('button', { name: '팔로우' })).toBeVisible();
    await waitFor(() => expect(canvas.getByRole('link', { name: /팔로잉/ })).toHaveFocus());
  },
};

export const MutedLoadingContract: Story = {
  args: { muted: true, loading: true },
  play: ({ canvasElement }) => {
    expect(
      within(canvasElement).queryByRole('button', { name: '뮤트 해제' }),
    ).not.toBeInTheDocument();
  },
};

export const MenuMuteContract: Story = {
  play: async ({ args, canvasElement }) => {
    args.onMute?.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '더보기' });
    expect(trigger.getBoundingClientRect().height).toBe(40);
    expect(trigger.getBoundingClientRect().width).toBe(40);
    await userEvent.click(trigger);
    expect(await body.findByRole('menuitem', { name: '프로필 링크 복사' })).toBeVisible();
    expect((await body.findAllByRole('menuitem')).map((item) => item.textContent?.trim())).toEqual([
      '프로필 링크 복사',
      '뮤트',
      '차단',
    ]);
    const menu = body.getByRole('menu', { name: '더보기' });
    await waitFor(() =>
      expect(
        Math.abs(menu.getBoundingClientRect().right - trigger.getBoundingClientRect().right),
      ).toBeLessThanOrEqual(1),
    );
    await waitFor(() =>
      expect(menu.getBoundingClientRect().top).toBeCloseTo(trigger.getBoundingClientRect().top, 0),
    );
    await userEvent.click(body.getByRole('menuitem', { name: '뮤트' }));
    await userEvent.click(await body.findByRole('button', { name: '취소' }));
    expect(args.onMute).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '뮤트' }));
    await userEvent.click(await body.findByRole('button', { name: '뮤트' }));
    expect(await canvas.findByText('이 사용자의 게시글은 뮤트되어 있습니다.')).toBeVisible();
    expect(canvas.getByRole('button', { name: '팔로우' })).toBeVisible();
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

export const BlockContract: Story = {
  play: async ({ args, canvasElement }) => {
    args.onBlock.mockClear();
    args.onBlockDismiss?.mockClear();
    args.onBlockFeedback.mockClear();
    args.onUnblock?.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const followRect = canvas.getByRole('button', { name: /^팔로우$/ }).getBoundingClientRect();
    const trigger = canvas.getByRole('button', { name: '더보기' });

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
      '프로필 링크 복사',
      '뮤트',
      '차단',
    ]);
    await userEvent.click(body.getByRole('menuitem', { name: '차단' }));
    const dialog = await body.findByRole('dialog', { name: '이 프로필을 차단할까요?' });
    expect(
      within(dialog).getByText(
        '상대방은 내 게시물을 볼 수 없고, 타임라인과 검색에서 서로의 게시물이 숨겨져요. 팔로우 관계와 요청은 삭제돼요.',
      ),
    ).toBeVisible();
    expect(args.onBlock).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: '차단' }));
    await waitFor(() => expect(args.onBlock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(args.onBlockFeedback).toHaveBeenCalledWith({ blocked: true, status: 'success' }),
    );
    expect(canvas.getByRole('heading', { name: '프로필 히어로' })).toBeVisible();
    const unblockRect = canvas
      .getByRole('button', { name: '프로필 히어로 차단 해제' })
      .getBoundingClientRect();
    expect(unblockRect.width).toBe(followRect.width);
    expect(unblockRect.height).toBe(followRect.height);
    expect(canvas.getByRole('button', { name: '더보기' })).toBeVisible();
    await waitFor(() => expect(canvas.getByTestId('profile-hero-surface')).toHaveFocus());
    expect(await body.findByText('프로필 히어로 님이 차단되었어요')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: '프로필 히어로 차단 해제' }));
    const unblockDialog = await body.findByRole('dialog', {
      name: '이 프로필의 차단을 해제할까요?',
    });
    expect(
      within(unblockDialog).getByText('차단을 해제해도 이전 팔로우 관계는 복구되지 않아요.'),
    ).toBeVisible();
    await userEvent.click(within(unblockDialog).getByRole('button', { name: '차단 해제' }));
    await waitFor(() => expect(args.onUnblock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(args.onBlockFeedback).toHaveBeenLastCalledWith({
        blocked: false,
        status: 'success',
      }),
    );
    expect(canvas.getByRole('button', { name: '팔로우' })).toBeVisible();
    expect(canvas.getByRole('button', { name: '더보기' })).toBeVisible();
    await waitFor(() => expect(canvas.getByTestId('profile-hero-surface')).toHaveFocus());
    expect(
      canvas.queryByRole('button', { name: '프로필 히어로 차단 해제' }),
    ).not.toBeInTheDocument();
  },
};

export const BlockFailureContract: Story = {
  args: { outcome: 'error' },
  play: async ({ args, canvasElement }) => {
    args.onBlock.mockClear();
    args.onBlockFeedback.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '더보기' });

    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '차단' }));
    await userEvent.click(await body.findByRole('button', { name: '차단' }));
    await waitFor(() => expect(args.onBlock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(args.onBlockFeedback).toHaveBeenCalledWith({ blocked: true, status: 'error' }),
    );
    expect(await body.findByText('차단하지 못했어요. 다시 시도해 주세요.')).toBeVisible();
    expect(body.queryByRole('dialog', { name: '이 프로필을 차단할까요?' })).not.toBeInTheDocument();
    expect(canvas.getByRole('heading', { name: '프로필 히어로' })).toBeVisible();
    await waitFor(() => expect(trigger).toHaveFocus());

    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole('menuitem', { name: '차단' }));
    await userEvent.click(await body.findByRole('button', { name: '차단' }));
    await waitFor(() => expect(args.onBlock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(args.onBlockFeedback).toHaveBeenCalledTimes(2));
    expect(canvas.getByRole('heading', { name: '프로필 히어로' })).toBeVisible();
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

export const BlockPendingContract: Story = {
  args: { outcome: 'pending' },
  play: async ({ args, canvasElement }) => {
    args.onBlock.mockClear();
    args.onBlockFeedback.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: '더보기' }));
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
    expect(canvas.getByRole('heading', { name: '프로필 히어로' })).toBeVisible();
  },
};

export const LateCompletionIgnoredAfterProfileChange: Story = {
  play: async ({ args, canvasElement }) => {
    args.onBlock.mockClear();
    args.onBlockFeedback.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole('button', { name: '더보기' }));
    await userEvent.click(await body.findByRole('menuitem', { name: '차단' }));
    await userEvent.click(await body.findByRole('button', { name: '차단' }));
    await waitFor(() => expect(args.onBlock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(canvas.getByRole('heading', { name: '이미지 프로필' })).toBeVisible(),
    );
    await waitFor(() => expect(body.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(canvas.getByRole('button', { name: '이전 요청 완료' }));
    expect(await canvas.findByRole('button', { name: '이전 요청 완료됨' })).toBeVisible();
    expect(args.onBlockFeedback).not.toHaveBeenCalled();
    expect(body.queryByText('프로필 히어로 님이 차단되었어요')).not.toBeInTheDocument();
    expect(body.queryByText('이미지 프로필 님이 차단되었어요')).not.toBeInTheDocument();
  },
  render: (args) => (
    <LateCompletionFixture onBlock={args.onBlock} onBlockFeedback={args.onBlockFeedback} />
  ),
};

export const MoreButtonInteraction: Story = {
  args: { actionSize: 'medium' },
  globals: { theme: 'light', viewport: { isRotated: false, value: 'kosmoFull' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: '더보기' });
    const visual = getTriggerVisual(trigger);
    const serializeColor = (color: string) => {
      const probe = canvasElement.ownerDocument.createElement('div');
      probe.style.color = color;
      return probe.style.color;
    };
    const hoverColor = serializeColor(semanticColors.light.stateHover);
    const pressedColor = serializeColor(semanticColors.light.statePressed);

    await userEvent.hover(trigger);
    await waitFor(() => expect(getComputedStyle(visual).backgroundColor).toBe(hoverColor));
    await userEvent.pointer({ keys: '[MouseLeft>]', target: trigger });
    await waitFor(() => expect(getComputedStyle(visual).backgroundColor).toBe(pressedColor));
    await userEvent.pointer({ keys: '[/MouseLeft]', target: trigger });
    await userEvent.keyboard('{Escape}');

    trigger.blur();
    await userEvent.tab();
    await waitFor(() => expect(trigger).toHaveFocus());
    await waitFor(() => {
      const style = getComputedStyle(visual);
      expect(style.backgroundColor).toBe(hoverColor);
      expect(style.outlineStyle).toBe('solid');
      expect(style.outlineWidth).toBe('2px');
    });
  },
};

export const CompactMenuViewportCollision: Story = {
  args: { actionSize: 'medium' },
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '더보기' });
    Object.assign(trigger.style, { bottom: '8px', left: '8px', position: 'fixed' });
    await userEvent.click(trigger);
    const menu = await body.findByRole('menu', { name: '더보기' });
    const viewport = canvasElement.ownerDocument.documentElement;

    await waitFor(() => {
      const menuRect = menu.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      expect(menuRect.left).toBeGreaterThanOrEqual(0);
      expect(menuRect.top).toBeGreaterThanOrEqual(0);
      expect(menuRect.right).toBeLessThanOrEqual(viewport.clientWidth);
      expect(menuRect.bottom).toBeLessThanOrEqual(viewport.clientHeight);
      expect(menuRect.bottom).toBeCloseTo(triggerRect.bottom, 0);
    });

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
