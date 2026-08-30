import baseMeta, {
  PillInteractionContract as pillInteractionContract,
  UnderlineInteractionContract as underlineInteractionContract,
} from './Tabs.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Tabs/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const UnderlineInteractionContract: Story = underlineInteractionContract;
export const PillInteractionContract: Story = pillInteractionContract;
