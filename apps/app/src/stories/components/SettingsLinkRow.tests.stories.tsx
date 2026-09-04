import baseMeta, {
  InteractionContract as interactionContract,
  ReducedMotionContract as reducedMotionContract,
} from './SettingsLinkRow.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Settings Link Row/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;
export const ReducedMotionContract: Story = reducedMotionContract;
