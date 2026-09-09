import { expect, userEvent, waitFor, within } from 'storybook/test';
import baseMeta from './ProfileMoreMenu.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  title: 'KOSMO/Patterns/Profile/More Menu/Tests',
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const SelectionAndFocus: Story = {
  play: async ({ args, canvasElement }) => {
    args.onSelect.mockClear();
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: '더보기' });
    await userEvent.click(trigger);
    await userEvent.click(
      await body.findByRole('menuitem', { name: args.blocked ? '차단 해제' : '차단' }),
    );
    expect(args.onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(body.queryByRole('menu')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    await body.findByRole('menu');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(args.onSelect).toHaveBeenCalledTimes(1);
  },
};
export const UnblockSelection: Story = { ...SelectionAndFocus, args: { blocked: true } };
