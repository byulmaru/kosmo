import { expect, userEvent, waitFor, within } from 'storybook/test';
import { spacing } from '@/theme/tokens';
import baseMeta, {
  ProfileSwitcherGuardedDrawer as profileSwitcherGuardedDrawer,
  UniversalCompactComposerLifecycle as universalCompactComposerLifecycle,
  UniversalFullComposerLifecycle as universalFullComposerLifecycle,
  UniversalMobile as universalMobile,
  UniversalMobileComposerLifecycle as universalMobileComposerLifecycle,
  UniversalMobileLongProfilePickerScroll as universalMobileLongProfilePickerScroll,
} from './Shell.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/Shell/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const UniversalCompactComposerLifecycle: Story = {
  ...universalCompactComposerLifecycle,
  play: async (context) => {
    await universalCompactComposerLifecycle.play?.(context);
    const page = within(context.canvasElement.ownerDocument.body);
    const dialog = within(page.getByRole('dialog', { name: '글쓰기' }));
    const trigger = dialog.getByRole('button', { name: '공개 범위: 조용한 공개' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const menu = within(dialog.getByRole('radiogroup', { name: '공개 범위 선택' }));
    expect(menu.getByRole('radio', { name: '조용한 공개' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(menu.getByRole('radio', { name: '조용한 공개' })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(menu.getByRole('radio', { name: '팔로워만' })).toHaveFocus();
    expect(menu.getByRole('radio', { name: '팔로워만' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('{Home}{Shift>}{Tab}{/Shift}');
    expect(trigger).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(dialog.queryByRole('radiogroup')).toBeNull();
    expect(trigger).toHaveFocus();
    expect(page.getByRole('dialog', { name: '글쓰기' })).toBeVisible();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger);
    await userEvent.click(dialog.getByRole('textbox', { name: '게시물 내용' }));
    expect(dialog.queryByRole('radiogroup')).toBeNull();
  },
};
export const UniversalCompactOverlayGeometry: Story = {
  ...universalCompactComposerLifecycle,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: '글쓰기' }));
    const dialog = await page.findByRole('dialog', { name: '글쓰기' });
    const maxHeight = canvasElement.ownerDocument.defaultView!.innerHeight - 96;
    const initialHeight = dialog.getBoundingClientRect().height;
    expect(initialHeight).toBeLessThan(maxHeight);

    const body = within(dialog).getByRole('textbox', { name: '게시물 내용' });
    await userEvent.type(body, '\n추가 본문'.repeat(10));
    await waitFor(() =>
      expect(dialog.getBoundingClientRect().height).toBeGreaterThan(initialHeight),
    );
    await userEvent.type(body, '\n긴 본문'.repeat(40));
    const scroll = within(dialog).getByTestId('post-composer-scroll');
    await waitFor(() => expect(dialog.getBoundingClientRect().height).toBeCloseTo(maxHeight, 0));
    expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
    expect(getComputedStyle(scroll).scrollbarGutter).toBe('stable');
    expect(getComputedStyle(scroll).scrollbarWidth).toBe('thin');
    await userEvent.clear(body);
    await waitFor(() => expect(dialog.getBoundingClientRect().height).toBeLessThan(maxHeight));
  },
};
export const UniversalFullComposerLifecycle: Story = {
  ...universalFullComposerLifecycle,
  play: async (context) => {
    await universalFullComposerLifecycle.play?.(context);
    const page = within(context.canvasElement.ownerDocument.body);
    const railComposer = page.getByTestId('post-composer-target');
    const privacyLink = page.getByRole('link', { name: '개인정보 처리방침' });
    const railHeight = railComposer.getBoundingClientRect().height;
    expect(railComposer.getBoundingClientRect().width).toBe(320);
    expect(privacyLink.getBoundingClientRect().left).toBeCloseTo(
      railComposer.getBoundingClientRect().left + spacing.lg,
      0,
    );
    await userEvent.click(page.getByRole('button', { name: 'Composer 확장' }));
    const dialog = page.getByRole('dialog', { name: '글쓰기' });
    expect(dialog.getBoundingClientRect().height).toBeGreaterThan(railHeight);
    expect(dialog.getBoundingClientRect().top).toBe(48);
    expect(dialog.getBoundingClientRect().width).toBe(640);
    const overlayBody = within(dialog).getByRole('textbox', { name: '게시물 내용' });
    const initialDialogHeight = dialog.getBoundingClientRect().height;
    await userEvent.type(overlayBody, '\n추가 본문'.repeat(10));
    await waitFor(() =>
      expect(dialog.getBoundingClientRect().height).toBeGreaterThan(initialDialogHeight),
    );
    await userEvent.type(overlayBody, '\n긴 본문'.repeat(40));
    const scroll = within(dialog).getByTestId('post-composer-scroll');
    await waitFor(() =>
      expect(dialog.getBoundingClientRect().height).toBeCloseTo(
        context.canvasElement.ownerDocument.defaultView!.innerHeight - 96,
        0,
      ),
    );
    expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
    expect(page.queryByRole('link', { name: '개인정보 처리방침' })).toBeNull();
  },
};
export const UniversalMobileComposerLifecycle: Story = {
  ...universalMobileComposerLifecycle,
  play: async (context) => {
    await universalMobileComposerLifecycle.play?.(context);
    const document = context.canvasElement.ownerDocument;
    const dialog = within(within(document.body).getByRole('dialog', { name: '글쓰기' }));
    const footer = dialog.getByTestId('mobile-composer-footer');
    await waitFor(() =>
      expect(footer.getBoundingClientRect().bottom).toBe(document.defaultView!.innerHeight),
    );
    expect(footer.getBoundingClientRect().height).toBe(64);
    expect(
      dialog.getByRole('textbox', { name: '게시물 내용' }).getBoundingClientRect().height,
    ).toBeGreaterThan(400);
  },
};

export const UniversalMobileProfilePickerDismissesInsideDrawer: Story = {
  ...universalMobile,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: '메뉴 열기' }));

    const drawer = await page.findByRole('navigation', { name: '주요 메뉴' });
    const trigger = page.getByRole('button', { name: '프로필 목록' });
    await userEvent.click(trigger);
    await page.findByLabelText('프로필 전환');

    const profileSummary = page.getByLabelText('활성 프로필');
    await userEvent.click(within(profileSummary).getByLabelText('코스모 작가 프로필 이미지'));
    await waitFor(() => expect(page.queryByLabelText('프로필 전환')).toBeNull());
    expect(drawer).toBeVisible();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(trigger);
    const picker = await page.findByLabelText('프로필 전환');
    await userEvent.click(within(picker).getByRole('button', { name: '새 프로필 추가' }));
    const input = page.getByRole('textbox', { name: '프로필 핸들' });
    await userEvent.type(input, 'drawer_draft');
    expect(picker).toBeVisible();
    expect(input).toHaveValue('drawer_draft');
    expect(input).toHaveFocus();

    const utility = within(drawer).getByRole('button', { name: '설정 및 기타' });
    await userEvent.click(utility);

    await waitFor(() => expect(page.queryByLabelText('프로필 전환')).toBeNull());
    expect(drawer).toBeVisible();
    expect(utility).toHaveFocus();
    expect(utility).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(trigger);
    const reopenedPicker = await page.findByLabelText('프로필 전환');
    await userEvent.click(within(reopenedPicker).getByRole('button', { name: '새 프로필 추가' }));
    expect(page.getByRole('textbox', { name: '프로필 핸들' })).toHaveValue('drawer_draft');
    await userEvent.click(trigger);
    expect(page.queryByLabelText('프로필 전환')).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(drawer).toBeVisible();

    await userEvent.click(trigger);
    await page.findByLabelText('프로필 전환');
    const followRequestsLink = within(drawer).getByRole('link', { name: '팔로워 요청' });
    expect(followRequestsLink).toHaveAttribute('href', '/follow-requests');
    await userEvent.click(followRequestsLink);
    await waitFor(() => expect(page.queryByRole('navigation', { name: '주요 메뉴' })).toBeNull());
    expect(page.queryByLabelText('프로필 전환')).toBeNull();

    await userEvent.click(canvas.getByRole('link', { name: '홈' }));
    await userEvent.click(canvas.getByRole('button', { name: '메뉴 열기' }));
    await page.findByRole('navigation', { name: '주요 메뉴' });
    const reopenedTrigger = page.getByRole('button', { name: '프로필 목록' });
    await userEvent.click(reopenedTrigger);
    await page.findByLabelText('프로필 전환');
    await userEvent.click(page.getByRole('button', { name: '사이드바 닫기' }));
    await waitFor(() => expect(page.queryByRole('navigation', { name: '주요 메뉴' })).toBeNull());
    expect(page.queryByLabelText('프로필 전환')).toBeNull();
    await waitFor(() => expect(canvas.getByRole('button', { name: '메뉴 열기' })).toHaveFocus());
  },
};

export const UniversalMobileCombinedDrawerScroll: Story = {
  ...universalMobileLongProfilePickerScroll,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const ownerDocument = canvasElement.ownerDocument;
    const page = within(ownerDocument.body);
    const previousBodyStyle = {
      left: ownerDocument.body.style.left,
      overflow: ownerDocument.body.style.overflow,
      position: ownerDocument.body.style.position,
      right: ownerDocument.body.style.right,
      top: ownerDocument.body.style.top,
      width: ownerDocument.body.style.width,
    };
    await userEvent.click(canvas.getByRole('button', { name: '메뉴 열기' }));

    const drawer = await page.findByRole('navigation', { name: '주요 메뉴' });
    const drawerScroll = page.getByTestId('mobile-sidebar-scroll');
    await userEvent.click(within(drawer).getByRole('button', { name: '설정 및 기타' }));
    const scrollControls = [
      within(drawer).getByRole('link', { name: '홈' }),
      within(drawer).getByRole('button', { name: '피드백 보내기' }),
      within(drawer).getByRole('link', { name: '설정' }),
      within(drawer).getByRole('button', { name: '로그아웃' }),
    ];
    const logout = scrollControls[3];
    drawerScroll.scrollTop = 0;
    await waitFor(() => expect(drawerScroll.scrollTop).toBe(0));
    const scrollDelta = Math.min(24, drawerScroll.scrollHeight - drawerScroll.clientHeight);
    const beforeControlTops = scrollControls.map((control) => control.getBoundingClientRect().top);

    expect(scrollDelta).toBeGreaterThan(0);
    drawerScroll.scrollTop = scrollDelta;
    await waitFor(() => expect(drawerScroll.scrollTop).toBe(scrollDelta));
    const afterControlTops = scrollControls.map((control) => control.getBoundingClientRect().top);
    for (const [index, top] of afterControlTops.entries()) {
      expect(beforeControlTops[index] - top).toBeCloseTo(scrollDelta, 0);
    }
    drawerScroll.scrollTop = drawerScroll.scrollHeight;
    await waitFor(() => expect(drawerScroll.scrollTop).toBeGreaterThan(0));
    const drawerScrollBounds = drawerScroll.getBoundingClientRect();
    const logoutBounds = logout.getBoundingClientRect();
    expect(logoutBounds.top).toBeGreaterThanOrEqual(drawerScrollBounds.top);
    expect(logoutBounds.bottom).toBeLessThanOrEqual(drawerScrollBounds.bottom);
    await userEvent.click(page.getByRole('button', { name: '사이드바 닫기' }));
    await waitFor(() => {
      expect(ownerDocument.getElementById('mobile-sidebar')).toBeNull();
      expect(ownerDocument.body.style).toMatchObject(previousBodyStyle);
    });
  },
};

export const UniversalMobileProfilePickerKeyboard: Story = {
  ...universalMobile,
  parameters: {
    ...universalMobile.parameters,
    relay: {
      ...universalMobile.parameters?.relay,
      mutationResponse: { selectProfile: { profile: { id: 'profile-remote' } } },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const menuButton = canvas.getByRole('button', { name: '메뉴 열기' });

    await userEvent.click(menuButton);
    await page.findByRole('navigation', { name: '주요 메뉴' });
    const profileTrigger = page.getByRole('button', { name: '프로필 목록' });

    profileTrigger.focus();
    await userEvent.keyboard('{Enter}');
    const picker = await page.findByLabelText('프로필 전환');
    const options = within(picker).getAllByRole('button');

    expect(profileTrigger).toHaveFocus();
    expect(options[0]).toHaveAttribute('aria-current', 'true');
    await userEvent.tab();
    expect(options[0]).toHaveFocus();
    await userEvent.tab();
    expect(options[1]).toHaveFocus();
    expect(options[0]).toHaveAttribute('aria-current', 'true');
    expect(options[1]).not.toHaveAttribute('aria-current');
    await userEvent.keyboard(' ');
    await waitFor(() => expect(profileTrigger).toHaveAttribute('aria-expanded', 'false'));

    profileTrigger.focus();
    await userEvent.keyboard('{Enter}');
    const reopenedPicker = await page.findByLabelText('프로필 전환');
    const reopenedOptions = within(reopenedPicker).getAllByRole('button');
    const reopenedAddProfile = within(reopenedPicker).getByRole('button', {
      name: '새 프로필 추가',
    });
    await userEvent.tab();
    expect(reopenedOptions[0]).toHaveFocus();
    await userEvent.tab();
    expect(reopenedOptions[1]).toHaveFocus();
    expect(reopenedOptions[0]).toHaveAttribute('aria-current', 'true');
    expect(reopenedOptions[1]).not.toHaveAttribute('aria-current');
    await userEvent.tab();
    expect(reopenedAddProfile).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    const handle = page.getByRole('textbox', { name: '프로필 핸들' });
    const createButton = page.getByRole('button', { name: '만들기' });
    // userEvent loses the Tab origin when the focused add button unmounts.
    // Re-enter from the trigger; native browser Tab continuation is checked separately.
    profileTrigger.focus();
    await userEvent.tab();
    expect(reopenedOptions[0]).toHaveFocus();
    await userEvent.tab();
    expect(reopenedOptions[1]).toHaveFocus();
    await userEvent.tab();
    expect(handle).toHaveFocus();
    await userEvent.keyboard('keyboard_draft');
    await userEvent.tab();
    expect(createButton).toHaveFocus();
    const followingLink = within(page.getByLabelText('활성 프로필')).getByRole('link', {
      name: /팔로잉/,
    });
    await userEvent.tab();
    expect(followingLink).toHaveFocus();
    await waitFor(() => expect(page.queryByLabelText('프로필 전환')).toBeNull());

    profileTrigger.focus();
    await userEvent.keyboard('{Enter}');
    const pickerAfterReopen = await page.findByLabelText('프로필 전환');
    const addProfileAfterReopen = within(pickerAfterReopen).getByRole('button', {
      name: '새 프로필 추가',
    });
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(addProfileAfterReopen).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(page.getByRole('textbox', { name: '프로필 핸들' })).toHaveValue('keyboard_draft');

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(page.queryByLabelText('프로필 전환')).toBeNull());
    expect(profileTrigger).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(page.queryByRole('navigation', { name: '주요 메뉴' })).toBeNull());
    expect(menuButton).toHaveFocus();
  },
};

export const ProfileSwitcherDrawerNestedDialogEscape: Story = {
  ...profileSwitcherGuardedDrawer,
  parameters: {
    ...profileSwitcherGuardedDrawer.parameters,
    controls: { disable: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: '프로필 목록' }));
    const picker = await canvas.findByLabelText('프로필 전환');
    const options = within(picker).getAllByRole('button');

    await userEvent.click(options[1]!);
    const discardDialog = await page.findByRole('dialog', { name: '변경사항을 버릴까요?' });
    expect(discardDialog).toBeVisible();
    await userEvent.keyboard('{Escape}');

    await waitFor(() =>
      expect(page.queryByRole('dialog', { name: '변경사항을 버릴까요?' })).toBeNull(),
    );
    expect(canvas.getByLabelText('프로필 전환')).toBeVisible();
  },
};
