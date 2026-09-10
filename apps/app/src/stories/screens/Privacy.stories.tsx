import PrivacyScreen from '@/app/privacy';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  component: PrivacyScreen,
  parameters: { router: { pathname: '/privacy' } },
  title: 'KOSMO/Screens/Privacy',
} satisfies Meta<typeof PrivacyScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Policy: Story = {};
