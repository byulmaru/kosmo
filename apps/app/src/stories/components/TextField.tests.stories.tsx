import baseMeta, { TypingAndFocus as typingAndFocus } from './TextField.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Text Field/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const TypingAndFocus: Story = typingAndFocus;
