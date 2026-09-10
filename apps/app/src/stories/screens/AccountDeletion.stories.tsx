import AccountDeletionScreen from '@/app/account-deletion';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  component: AccountDeletionScreen,
  parameters: { router: { pathname: '/account-deletion' } },
  title: 'KOSMO/Screens/Account deletion',
} satisfies Meta<typeof AccountDeletionScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Policy: Story = {};
