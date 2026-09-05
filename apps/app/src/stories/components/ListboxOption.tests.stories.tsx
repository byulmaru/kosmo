import baseMeta, {
  DisabledSelectionContract as disabledSelectionContract,
  EnabledSelectionContract as enabledSelectionContract,
  ReducedMotionContract as reducedMotionContract,
} from './ListboxOption.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ListboxOptionProps } from '@/components/ui/ListboxOption';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Listbox Option/Tests',
} satisfies Meta<ListboxOptionProps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EnabledSelectionContract: Story = enabledSelectionContract;
export const DisabledSelectionContract: Story = disabledSelectionContract;
export const ReducedMotionContract: Story = reducedMotionContract;
