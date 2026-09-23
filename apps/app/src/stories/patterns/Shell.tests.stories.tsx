import { expect, userEvent, waitFor, within } from 'storybook/test';
import { spacing } from '@/theme/tokens';
import baseMeta, {
  UniversalCompactComposerLifecycle as universalCompactComposerLifecycle,
  UniversalFullComposerLifecycle as universalFullComposerLifecycle,
  UniversalMobile as universalMobile,
  UniversalMobileComposerLifecycle as universalMobileComposerLifecycle,
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
    await page.findByRole('menu', { name: '프로필 전환' });

    const profileSummary = page.getByLabelText('활성 프로필');
    await userEvent.click(within(profileSummary).getByLabelText('코스모 작가 프로필 이미지'));
    await waitFor(() => expect(page.queryByRole('menu', { name: '프로필 전환' })).toBeNull());
    expect(drawer).toBeVisible();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(trigger);
    const picker = await page.findByRole('menu', { name: '프로필 전환' });
    await userEvent.click(within(picker).getByRole('menuitem', { name: '새 프로필 추가' }));
    const input = page.getByRole('textbox', { name: '프로필 핸들' });
    await userEvent.type(input, 'drawer_draft');
    expect(picker).toBeVisible();
    expect(input).toHaveValue('drawer_draft');
    expect(input).toHaveFocus();

    const utility = within(drawer).getByRole('button', { name: '설정 및 기타' });
    await userEvent.click(utility);

    await waitFor(() => expect(page.queryByRole('menu', { name: '프로필 전환' })).toBeNull());
    expect(drawer).toBeVisible();
    expect(utility).toHaveFocus();
    expect(utility).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(trigger);
    const reopenedPicker = await page.findByRole('menu', { name: '프로필 전환' });
    await userEvent.click(within(reopenedPicker).getByRole('menuitem', { name: '새 프로필 추가' }));
    expect(page.getByRole('textbox', { name: '프로필 핸들' })).toHaveValue('drawer_draft');
    await userEvent.click(trigger);
    expect(page.queryByRole('menu', { name: '프로필 전환' })).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(drawer).toBeVisible();

    await userEvent.click(trigger);
    await page.findByRole('menu', { name: '프로필 전환' });
    const followRequestsLink = within(drawer).getByRole('link', { name: '팔로워 요청' });
    expect(followRequestsLink).toHaveAttribute('href', '/follow-requests');
    await userEvent.click(followRequestsLink);
    await waitFor(() => expect(page.queryByRole('navigation', { name: '주요 메뉴' })).toBeNull());
    expect(page.queryByRole('menu', { name: '프로필 전환' })).toBeNull();

    await userEvent.click(canvas.getByRole('link', { name: '홈' }));
    await userEvent.click(canvas.getByRole('button', { name: '메뉴 열기' }));
    await page.findByRole('navigation', { name: '주요 메뉴' });
    const reopenedTrigger = page.getByRole('button', { name: '프로필 목록' });
    await userEvent.click(reopenedTrigger);
    await page.findByRole('menu', { name: '프로필 전환' });
    await userEvent.click(page.getByRole('button', { name: '사이드바 닫기' }));
    await waitFor(() => expect(page.queryByRole('navigation', { name: '주요 메뉴' })).toBeNull());
    expect(page.queryByRole('menu', { name: '프로필 전환' })).toBeNull();
    await waitFor(() => expect(canvas.getByRole('button', { name: '메뉴 열기' })).toHaveFocus());
  },
};
