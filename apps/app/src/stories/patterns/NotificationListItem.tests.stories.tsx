import baseMeta, {
  ActivationContract as activation,
  CompositionContract as composition,
  PendingContract as pending,
  ProtectionContract as protection,
} from './NotificationListItem.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { NotificationStoryArgs } from './NotificationListItem.stories';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Patterns/Notification List Item/Tests',
} satisfies Meta<NotificationStoryArgs>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ActivationContract: Story = activation;
export const PendingContract: Story = pending;
export const CompositionContract: Story = composition;
export const ProtectionContract: Story = protection;
