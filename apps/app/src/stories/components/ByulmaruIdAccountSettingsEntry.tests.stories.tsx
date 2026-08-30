import baseMeta, { LinkContract as linkContract } from './ByulmaruIdAccountSettingsEntry.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Byulmaru ID Account Settings Entry/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const LinkContract: Story = linkContract;
