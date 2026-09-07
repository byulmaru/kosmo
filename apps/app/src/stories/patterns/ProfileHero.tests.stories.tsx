import { expect, userEvent, waitFor, within } from 'storybook/test';
import baseMeta from './ProfileHero.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/ProfileHero/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

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
    const followButton = canvas.getByRole('button', { name: '팔로우' });
    expect(followButton.getBoundingClientRect().height).toBe(40);
    expect(followButton.getBoundingClientRect().width).toBe(96);
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
    const followButton = canvas.getByRole('button', { name: '팔로우' });
    expect(followButton.getBoundingClientRect().height).toBe(40);
    expect(followButton.getBoundingClientRect().width).toBe(96);
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
    expect(trigger.getBoundingClientRect().width).toBe(32);
    await userEvent.click(trigger);
    expect(await body.findByRole('menuitem', { name: '프로필 링크 복사' })).toBeVisible();
    const menu = body.getByRole('menu', { name: '더보기' });
    await waitFor(() =>
      expect(
        Math.abs(menu.getBoundingClientRect().right - trigger.getBoundingClientRect().right),
      ).toBeLessThanOrEqual(5),
    );
    await waitFor(() =>
      expect(menu.getBoundingClientRect().top - trigger.getBoundingClientRect().bottom).toBeCloseTo(
        8,
        0,
      ),
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
