import { expect, userEvent, waitFor, within } from 'storybook/test';
import { spacing } from '@/theme/tokens';
import baseMeta, {
  UniversalCompactComposerLifecycle as universalCompactComposerLifecycle,
  UniversalFullComposerLifecycle as universalFullComposerLifecycle,
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
    expect(railHeight).toBe(420);
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
