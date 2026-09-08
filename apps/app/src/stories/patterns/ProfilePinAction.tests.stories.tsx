import baseMeta, {
  ErrorRecoveryFocus as errorRecoveryFocus,
  ExistingDeletionFlow as existingDeletionFlow,
  OwnerMenuAndDirectActions as ownerMenuAndDirectActions,
  PendingContract as pendingContract,
  SheetIconContract as sheetIconContract,
  VisitorMenuContract as visitorMenuContract,
} from './ProfilePinAction.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/Profile/Pin Action/Tests',
} satisfies Meta<typeof baseMeta.component>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OwnerMenuAndDirectActions: Story = ownerMenuAndDirectActions;
export const VisitorMenuContract: Story = visitorMenuContract;
export const PendingContract: Story = pendingContract;
export const ErrorRecoveryFocus: Story = errorRecoveryFocus;
export const SheetIconContract: Story = sheetIconContract;

export const ExistingDeletionFlow: Story = existingDeletionFlow;
