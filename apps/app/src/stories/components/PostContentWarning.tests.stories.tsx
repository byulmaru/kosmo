import baseMeta, { InteractionContract as interactionContract } from './PostContentWarning.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PostContentWarningStoryArgs } from './PostContentWarning.stories';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Post Content Warning/Tests',
} satisfies Meta<PostContentWarningStoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;

export const InteractionContractDark: Story = {
  ...interactionContract,
  globals: { theme: 'dark' },
};
