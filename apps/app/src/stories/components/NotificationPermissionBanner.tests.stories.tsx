import baseMeta, {
  EnableAndDismissContract as enableAndDismissContract,
  PendingContract as pendingContract,
} from './NotificationPermissionBanner.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/NotificationPermissionBanner/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const EnableAndDismissContract: Story = enableAndDismissContract;
export const PendingContract: Story = pendingContract;
