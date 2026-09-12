import { expect, userEvent, waitFor, within } from 'storybook/test';
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
export const UniversalFullComposerLifecycle: Story = {
  ...universalFullComposerLifecycle,
  play: async (context) => {
    await universalFullComposerLifecycle.play?.(context);
    const page = within(context.canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: 'Composer 확장' }));
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
