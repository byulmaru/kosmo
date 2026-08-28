import baseMeta, {
  DarkInteractionContract as darkInteractionContract,
  InteractionContract as interactionContract,
} from './ActionMenu.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Action Menu/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;
export const DarkInteractionContract: Story = darkInteractionContract;
