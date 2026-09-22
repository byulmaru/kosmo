import { AccountDeletionScreen } from '@/components/settings/AccountDeletionScreen';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  component: AccountDeletionScreen,
  parameters: { layout: 'fullscreen' },
  title: 'KOSMO/Screens/Settings/Account deletion',
} satisfies Meta<typeof AccountDeletionScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  args: { state: { phase: 'loading' } },
};

export const Blocked: Story = {
  args: { state: { activeProfileCount: 2, phase: 'blocked' } },
};

export const LoadError: Story = {
  args: { state: { phase: 'load-error' } },
};

export const Confirmation: Story = {
  args: { state: { acknowledged: false, phase: 'idle' } },
};

export const Pending: Story = {
  args: { state: { phase: 'pending' } },
};

export const Error: Story = {
  args: { state: { acknowledged: true, phase: 'error' } },
};

export const Success: Story = {
  args: { state: { phase: 'success' } },
};
