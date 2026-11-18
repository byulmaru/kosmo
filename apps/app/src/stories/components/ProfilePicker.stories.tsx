import { fn } from 'storybook/test';
import { ProfilePicker } from '@/components/profile/ProfilePicker';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  component: ProfilePicker,
  title: 'KOSMO/Components/Profile Picker',
  args: {
    maxHeight: 240,
    onSelect: fn(),
    profiles: Array.from({ length: 16 }, (_, index) => ({
      displayName: `작성자 ${index + 1}`,
      id: `picker-profile-${index}`,
      relativeHandle: `@writer${index + 1}`,
    })),
    selectedProfileId: 'picker-profile-0',
    surface: 'full',
  },
} satisfies Meta<typeof ProfilePicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const HeightLimited: Story = {};
