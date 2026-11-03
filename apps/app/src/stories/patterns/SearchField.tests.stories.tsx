import baseMeta, {
  DisabledContract as disabledContract,
  InputClearAndFocus as inputClearAndFocus,
} from './SearchField.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SearchFieldArgs } from './SearchField.stories';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/Search Field/Tests',
} satisfies Meta<SearchFieldArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InputClearAndFocus: Story = inputClearAndFocus;
export const DisabledContract: Story = disabledContract;
