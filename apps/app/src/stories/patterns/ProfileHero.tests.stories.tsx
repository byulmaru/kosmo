import { expect, userEvent, waitFor, within } from 'storybook/test';
import { semanticColors } from '@/theme/tokens';
import baseMeta from './ProfileHero.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

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
  args: { containerWidth: 390, profileId: 'profile-hero-no-bio' },
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
    expect(canvas.getByLabelText('소개 없는 히어로 프로필 이미지')).toBeVisible();
    const handle = canvas.getByText('@no-bio');
    const identity = handle.parentElement;
    expect(identity).toBeInstanceOf(HTMLElement);
    expect(getComputedStyle(identity as HTMLElement).flexBasis).toBe('auto');
    const handleRect = handle.getBoundingClientRect();
    const countsRect = canvas.getByRole('link', { name: /팔로잉/ }).getBoundingClientRect();
    expect(countsRect.top - handleRect.bottom).toBeCloseTo(12, 0);
  },
};

export const LoadingGeometryContract: Story = {
  args: { loading: true, showAction: true },
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
  args: { profileId: 'profile-hero-muted' },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('이 사용자의 게시글은 뮤트되어 있습니다.')).toBeVisible();
    expect(canvas.getByRole('button', { name: '팔로우' })).toBeVisible();
    expect(canvas.getByRole('button', { name: '뮤트 해제' })).toBeVisible();
  },
};

export const MutedLoadingContract: Story = {
  args: { loading: true, profileId: 'profile-hero-muted' },
  play: ({ canvasElement }) => {
    expect(
      within(canvasElement).queryByRole('button', { name: '뮤트 해제' }),
    ).not.toBeInTheDocument();
  },
};

export const MenuMuteContract: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '더보기' });
    expect(trigger.getBoundingClientRect().height).toBe(40);
    expect(trigger.getBoundingClientRect().width).toBe(40);
    await userEvent.click(trigger);
    expect(await body.findByRole('menuitem', { name: '프로필 링크 복사' })).toBeVisible();
    const menu = body.getByRole('menu', { name: '더보기' });
    await waitFor(() =>
      expect(
        Math.abs(menu.getBoundingClientRect().right - trigger.getBoundingClientRect().right),
      ).toBeLessThanOrEqual(1),
    );
    await waitFor(() =>
      expect(menu.getBoundingClientRect().top).toBeCloseTo(trigger.getBoundingClientRect().top, 0),
    );
    expect(body.getByRole('menuitem', { name: '뮤트' })).toBeVisible();
  },
};

export const MoreButtonInteraction: Story = {
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
