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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '더 보기' });
    await userEvent.click(trigger);
    expect(await body.findByRole('menuitem', { name: '링크 복사' })).toBeVisible();
    const menu = body.getByRole('menu', { name: '더 보기 메뉴' });
    await waitFor(() =>
      expect(menu.getBoundingClientRect().top).toBeCloseTo(
        trigger.getBoundingClientRect().top - 5,
        0,
      ),
    );
    await waitFor(() =>
      expect(
        Math.abs(menu.getBoundingClientRect().right - trigger.getBoundingClientRect().right),
      ).toBeLessThanOrEqual(5),
    );
    await userEvent.click(await body.findByRole('menuitem', { name: '뮤트' }));
    const cancel = await body.findByRole('button', { name: '취소' });
    await waitFor(() => expect(cancel).toHaveFocus());
    await userEvent.click(cancel);
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
