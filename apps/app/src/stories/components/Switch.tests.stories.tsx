import baseMeta, {
  DisabledInteractionContract as disabledInteractionContract,
  InteractionContract as interactionContract,
} from './Switch.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Switch/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;
export const DisabledInteractionContract: Story = disabledInteractionContract;
