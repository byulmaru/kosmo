import { expect, userEvent, waitFor, within } from 'storybook/test';
import baseMeta from './ProfileBlock.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Screens/Profile Block/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof baseMeta>;

export const BlockSuccessTransitionsToBlocking: Story = {
  args: { initialState: 'profile' },
  play: async ({ args, canvasElement }) => {
    args.onBlock.mockClear();
    args.onFeedback.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    expect(
      within(canvas.getByTestId('profile-hero-surface')).getByRole('heading', {
        name: '프로필 히어로',
      }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '더보기' }));
    const menu = await body.findByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent?.trim()),
    ).toEqual(['프로필 링크 복사', '뮤트', '차단']);
    await waitFor(() =>
      expect(Math.round(menu.getBoundingClientRect().width)).toBeGreaterThanOrEqual(160),
    );
    await userEvent.click(within(menu).getByRole('menuitem', { name: '차단' }));
    await userEvent.click(await body.findByRole('button', { name: '차단' }));
    await waitFor(() => expect(args.onBlock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(args.onFeedback).toHaveBeenCalledWith({ blocked: true, status: 'success' }),
    );
    expect(await canvas.findByText('차단됨')).toBeVisible();
    expect(
      within(canvas.getByTestId('profile-hero-surface')).getByRole('heading', {
        name: '프로필 히어로',
      }),
    ).toBeVisible();
    expect(await canvas.findByRole('button', { name: '프로필 히어로 차단 해제' })).toBeVisible();
    await waitFor(() => expect(canvas.getByTestId('profile-block-screen-content')).toHaveFocus());
  },
};

export const UnblockCancelRestoresFocus: Story = {
  play: async ({ args, canvasElement }) => {
    args.onUnblock.mockClear();
    args.onFeedback.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '프로필 히어로 차단 해제' });

    await userEvent.click(trigger);
    const dialog = await body.findByRole('dialog', {
      name: '이 프로필의 차단을 해제할까요?',
    });
    await userEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(body.queryByRole('dialog')).not.toBeInTheDocument());
    expect(args.onUnblock).not.toHaveBeenCalled();
    expect(args.onFeedback).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

export const UnblockSuccessTransitionsToProfile: Story = {
  play: async ({ args, canvasElement }) => {
    args.onUnblock.mockClear();
    args.onFeedback.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole('button', { name: '더보기' }));
    await userEvent.click(await body.findByRole('menuitem', { name: '차단 해제' }));
    const dialog = await body.findByRole('dialog', {
      name: '이 프로필의 차단을 해제할까요?',
    });
    await userEvent.click(within(dialog).getByRole('button', { name: '차단 해제' }));
    await waitFor(() => expect(args.onUnblock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(args.onFeedback).toHaveBeenCalledWith({ blocked: false, status: 'success' }),
    );
    expect(
      await within(canvas.getByTestId('profile-hero-surface')).findByRole('heading', {
        name: '프로필 히어로',
      }),
    ).toBeVisible();
    expect(canvas.queryByText('차단됨')).not.toBeInTheDocument();
    expect(
      canvas.queryByRole('button', { name: '프로필 히어로 차단 해제' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(canvas.getByTestId('profile-block-screen-content')).toHaveFocus());
  },
};

export const UnblockFailureRetries: Story = {
  args: { outcome: 'error' },
  play: async ({ args, canvasElement }) => {
    args.onUnblock.mockClear();
    args.onFeedback.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '프로필 히어로 차단 해제' });

    await userEvent.click(trigger);
    await userEvent.click(
      within(await body.findByRole('dialog', { name: '이 프로필의 차단을 해제할까요?' })).getByRole(
        'button',
        { name: '차단 해제' },
      ),
    );
    await waitFor(() => expect(args.onUnblock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(args.onFeedback).toHaveBeenCalledWith({ blocked: false, status: 'error' }),
    );
    expect(await body.findByText('차단을 해제하지 못했어요. 다시 시도해 주세요.')).toBeVisible();
    await waitFor(() => expect(trigger).toHaveFocus());

    await userEvent.click(trigger);
    await userEvent.click(
      within(await body.findByRole('dialog', { name: '이 프로필의 차단을 해제할까요?' })).getByRole(
        'button',
        { name: '차단 해제' },
      ),
    );
    await waitFor(() => expect(args.onUnblock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(args.onFeedback).toHaveBeenCalledTimes(2));
    expect(canvas.getByText('차단됨')).toBeVisible();
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

export const UnblockPendingBlocksDismiss: Story = {
  args: { outcome: 'pending' },
  play: async ({ args, canvasElement }) => {
    args.onUnblock.mockClear();
    args.onFeedback.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole('button', { name: '프로필 히어로 차단 해제' }));
    const dialog = await body.findByRole('dialog', {
      name: '이 프로필의 차단을 해제할까요?',
    });
    const confirm = within(dialog).getByRole('button', { name: '차단 해제' });
    await userEvent.click(confirm);
    await waitFor(() => expect(confirm).toHaveAttribute('aria-busy', 'true'));
    expect(within(dialog).getByRole('button', { name: '취소' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(within(dialog).getByRole('button', { name: '닫기' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await userEvent.keyboard('{Escape}');
    expect(confirm).toBeVisible();
    expect(args.onUnblock).toHaveBeenCalledTimes(1);
    expect(args.onFeedback).not.toHaveBeenCalled();
  },
};

export const FullProfileAndBlockedPosts: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoProfileFull' } },
  play: async ({ args, canvasElement }) => {
    args.onTabChange.mockClear();
    const canvas = within(canvasElement);
    const shell = canvas.getByTestId('profile-block-shell').getBoundingClientRect();
    const sidebar = canvas.getByTestId('profile-block-sidebar').getBoundingClientRect();
    const inner = canvas.getByTestId('profile-block-inner').getBoundingClientRect();
    const hero = within(canvas.getByTestId('profile-hero-surface'));
    const action = hero.getByRole('button', { name: '프로필 히어로 차단 해제' });
    const name = hero.getByRole('heading', { name: '프로필 히어로' });
    const posts = canvas.getByTestId('profile-block-posts');

    expect(Math.round(shell.width)).toBe(1270);
    expect(Math.round(sidebar.width)).toBe(320);
    expect(Math.round(inner.width)).toBe(600);
    expect(name).toBeVisible();
    expect(action.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      name.getBoundingClientRect().top,
    );
    expect(hero.getByRole('link', { name: /팔로잉/ })).toBeVisible();
    expect(hero.getByRole('link', { name: /팔로워/ })).toBeVisible();
    expect(within(posts).getByText('차단됨')).toBeVisible();
    expect(within(posts).queryByRole('button')).not.toBeInTheDocument();
    for (const label of ['답글', '미디어', '별', '게시물']) {
      const tab = canvas.getByRole('tab', { name: label });
      await userEvent.click(tab);
      expect(tab).toHaveAttribute('aria-selected', 'true');
      expect(within(posts).getByText('차단됨')).toBeVisible();
    }
    expect(args.onTabChange).toHaveBeenLastCalledWith('posts');
  },
};

export const CompactGeometry: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoProfileCompact' } },
  play: ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shell = canvas.getByTestId('profile-block-shell').getBoundingClientRect();
    const sidebar = canvas.getByTestId('profile-block-sidebar').getBoundingClientRect();
    const content = canvas.getByTestId('profile-block-content').getBoundingClientRect();
    const inner = canvas.getByTestId('profile-block-inner').getBoundingClientRect();

    expect(Math.round(shell.width)).toBe(1024);
    expect(Math.round(sidebar.x)).toBe(0);
    expect(Math.round(sidebar.width)).toBe(80);
    expect(Math.round(content.x)).toBe(80);
    expect(Math.round(content.width)).toBe(944);
    expect(Math.round(inner.width)).toBe(600);
  },
};

export const MobileProfileAndBack: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  play: async ({ args, canvasElement }) => {
    args.onBack.mockClear();
    const canvas = within(canvasElement);
    const shell = canvas.getByTestId('profile-block-shell').getBoundingClientRect();
    const hero = canvas.getByTestId('profile-hero-surface').getBoundingClientRect();
    const back = canvas.getByRole('button', { name: '뒤로' });

    expect(Math.round(shell.width)).toBe(390);
    expect(Math.round(shell.height)).toBe(844);
    expect(Math.round(hero.y)).toBe(64);
    expect(Math.round(hero.width)).toBe(390);
    const profile = within(canvas.getByTestId('profile-hero-surface'));
    expect(profile.getByText('@profile-hero').getBoundingClientRect().bottom).toBeLessThanOrEqual(
      profile.getByText('우주와 사람을 잇는 코스모 프로필입니다.').getBoundingClientRect().top,
    );
    expect(canvas.queryByTestId('profile-block-bottom-tab-bar')).not.toBeInTheDocument();
    expect(canvas.getByRole('tab', { name: '게시물' })).toHaveAttribute('aria-selected', 'true');
    expect(canvas.getByText('차단됨')).toBeVisible();
    const trigger = profile.getByRole('button', { name: '더보기' });
    const unblock = profile.getByRole('button', { name: '프로필 히어로 차단 해제' });
    const triggerRect = trigger.getBoundingClientRect();
    const unblockRect = unblock.getBoundingClientRect();
    expect(Math.round(triggerRect.y)).toBe(Math.round(unblockRect.y));
    expect(triggerRect.right).toBeLessThanOrEqual(unblockRect.left);
    await userEvent.click(trigger);
    const body = within(canvasElement.ownerDocument.body);
    const menu = await body.findByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent?.trim()),
    ).toEqual(['프로필 링크 복사', '차단 해제']);
    await waitFor(() =>
      expect(Math.round(menu.getBoundingClientRect().width)).toBeGreaterThanOrEqual(160),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByRole('menu')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(back);
    expect(args.onBack).toHaveBeenCalledTimes(1);
  },
};
