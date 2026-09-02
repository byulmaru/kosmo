import baseMeta, {
  LinkedSourceQuote as linkedSourceQuote,
  LinkedSourceQuoteInteraction as linkedSourceQuoteInteraction,
} from './Posts.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Patterns/Post/Catalog/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const LinkedSourceQuoteInteraction: Story = linkedSourceQuoteInteraction;

export const LinkedSourceQuoteDark: Story = {
  ...linkedSourceQuote,
  globals: { backgrounds: { value: 'kosmoDark' }, theme: 'dark' },
};
