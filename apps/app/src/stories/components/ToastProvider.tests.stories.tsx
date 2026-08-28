import baseMeta, {
  RepeatedMessageRestartsAutoDismiss as repeatedMessageRestartsAutoDismiss,
  ReplacementAndAutoDismiss as replacementAndAutoDismiss,
  ScopedCleanupDoesNotDismissNewerToast as scopedCleanupDoesNotDismissNewerToast,
} from './ToastProvider.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Toast Provider/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReplacementAndAutoDismiss: Story = replacementAndAutoDismiss;
export const RepeatedMessageRestartsAutoDismiss: Story = repeatedMessageRestartsAutoDismiss;
export const ScopedCleanupDoesNotDismissNewerToast: Story = scopedCleanupDoesNotDismissNewerToast;
