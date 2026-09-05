import baseMeta, {
  InteractionContract as interactionContract,
} from './MultiSelectCombobox.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { MultiSelectComboboxProps } from '@/components/ui/MultiSelectCombobox';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Multi Select Combobox/Tests',
} satisfies Meta<MultiSelectComboboxProps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;
