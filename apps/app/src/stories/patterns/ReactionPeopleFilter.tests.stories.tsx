import { expect, userEvent, within } from 'storybook/test';
import baseMeta, {
  ReactionPeopleFilterInteraction as Interaction,
} from './ReactionPeopleFilter.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Patterns/Reaction/People Filter/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

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
