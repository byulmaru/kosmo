import baseMeta, { ActionInteraction as actionInteraction } from './StateView.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/State View/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActionInteraction: Story = actionInteraction;
