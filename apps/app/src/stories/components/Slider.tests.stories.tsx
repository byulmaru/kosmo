import baseMeta, {
  InteractionContract as interactionContract,
  ReducedMotionContract as reducedMotionContract,
} from './Slider.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SliderProps } from '@/components/ui/Slider';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Slider/Tests',
} satisfies Meta<SliderProps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;
export const ReducedMotionContract: Story = reducedMotionContract;
