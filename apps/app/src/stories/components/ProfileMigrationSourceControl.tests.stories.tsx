import baseMeta, {
  FailureAndRetry as failureAndRetry,
  LateCompletionIgnoredAfterEnvironmentTransition as lateCompletionIgnoredAfterEnvironmentTransition,
  LongSourceReflowAtNarrowMobile as longSourceReflowAtNarrowMobile,
  LongSourceReflowAtWideWeb as longSourceReflowAtWideWeb,
  OwnerPreparationAndSuccess as ownerPreparationAndSuccess,
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
export const FailureAndRetry: Story = failureAndRetry;
export const LateCompletionIgnoredAfterEnvironmentTransition: Story =
  lateCompletionIgnoredAfterEnvironmentTransition;
export const LongSourceReflowAtNarrowMobile: Story = longSourceReflowAtNarrowMobile;
export const LongSourceReflowAtWideWeb: Story = longSourceReflowAtWideWeb;
