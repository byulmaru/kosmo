import ChildSafetyScreen from '@/app/child-safety';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  component: ChildSafetyScreen,
  parameters: { router: { pathname: '/child-safety' } },
  title: 'KOSMO/Screens/Child safety',
} satisfies Meta<typeof ChildSafetyScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Policy: Story = {};
