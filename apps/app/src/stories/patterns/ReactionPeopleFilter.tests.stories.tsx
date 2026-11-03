import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import baseMeta, {
  ReactionPeopleFilterInteraction as Interaction,
} from './ReactionPeopleFilter.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactionPeopleFilterPlaygroundArgs } from './ReactionPeopleFilter.stories';

const meta = {
  ...baseMeta,
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Patterns/Reaction/People Filter/Tests',
} satisfies Meta<ReactionPeopleFilterPlaygroundArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PlaygroundArgsReachProduction: Story = {
  args: {
    entries: [
      { count: 2, type: '🧩' },
      { count: 4, type: '🌙' },
    ],
    onValueChange: fn(),
    value: '🧩',
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const initial = await canvas.findByRole('tab', { name: '🧩 반응 2개' });
    const next = canvas.getByRole('tab', { name: '🌙 반응 4개' });

    expect(initial).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(next);
    await expect(args.onValueChange).toHaveBeenCalledWith('🌙');
    await waitFor(() => {
      expect(canvas.getByRole('tab', { name: '🌙 반응 4개' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(canvas.getByRole('tab', { name: '🧩 반응 2개' })).toHaveAttribute(
        'aria-selected',
        'false',
      );
    });
  },
};

export const ExpandCollapseAndSelection: Story = {
  render: () => <Interaction />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const getTablist = () => canvas.getByRole('tablist', { name: '반응 유형' });
    expect(within(getTablist()).getAllByRole('tab')).toHaveLength(6);

    const expand = canvas.getByRole('button', { name: '나머지 반응 1개 모두 보기' });
    await userEvent.click(expand);
    await canvas.findByRole('tab', { name: '💡 반응 2개' });
    expect(within(getTablist()).getAllByRole('tab')).toHaveLength(7);
    expect(canvas.getByRole('tab', { name: '💡 반응 2개' })).toBeVisible();

    const selectedOutlier = canvas.getByRole('tab', { name: '💡 반응 2개' });
    await userEvent.click(selectedOutlier);
    expect(selectedOutlier).toHaveAttribute('aria-selected', 'true');

    const collapse = canvas.getByRole('button', { name: '반응 목록 접기' });
    await userEvent.click(collapse);
    await canvas.findByRole('tab', { name: '💡 반응 2개' });
    expect(within(getTablist()).getAllByRole('tab')).toHaveLength(6);
    expect(collapse).toHaveFocus();
    expect(canvas.getByRole('tab', { name: '💡 반응 2개' })).toBeVisible();
  },
};
