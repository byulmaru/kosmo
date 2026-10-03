import baseMeta, {
  DestinationAddressUnavailable as destinationAddressUnavailable,
  FailureAndRetry as failureAndRetry,
  LateCompletionIgnoredAfterActorLifecycleReset as lateCompletionIgnoredAfterActorLifecycleReset,
  LongSourceReflowAtNarrowMobile as longSourceReflowAtNarrowMobile,
  LongSourceReflowAtWideWeb as longSourceReflowAtWideWeb,
  OwnerPreparationAndSuccess as ownerPreparationAndSuccess,
  OwnerUnregistersPreparedSource as ownerUnregistersPreparedSource,
} from './ProfileMigrationSourceControl.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Profile Migration Source Control/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const OwnerPreparationAndSuccess: Story = ownerPreparationAndSuccess;
export const OwnerUnregistersPreparedSource: Story = ownerUnregistersPreparedSource;
export const FailureAndRetry: Story = failureAndRetry;
export const LateCompletionIgnoredAfterActorLifecycleReset: Story =
  lateCompletionIgnoredAfterActorLifecycleReset;
export const DestinationAddressUnavailable: Story = destinationAddressUnavailable;
export const LongSourceReflowAtNarrowMobile: Story = longSourceReflowAtNarrowMobile;
export const LongSourceReflowAtWideWeb: Story = longSourceReflowAtWideWeb;
