import baseMeta, {
  QuickPickerMotionContract as quickPickerMotionContract,
  QuickPickerReducedMotionContract as quickPickerReducedMotionContract,
} from './Reactions.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/Reaction/Catalog/Tests',
} satisfies Meta<typeof baseMeta.component>;

export default meta;
type Story = StoryObj<typeof meta>;

export const QuickPickerMotionContract: Story = {
  ...quickPickerMotionContract,
  tags: ['motion'],
};
export const QuickPickerReducedMotionContract: Story = {
  ...quickPickerReducedMotionContract,
  tags: ['motion'],
};
