import baseMeta, {
  FallbackTabStop as fallbackTabStop,
  InteractionContract as interactionContract,
} from './RadioGroup.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Radio Group/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;
export const FallbackTabStop: Story = fallbackTabStop;
