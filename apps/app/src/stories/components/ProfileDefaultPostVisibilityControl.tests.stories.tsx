import baseMeta, {
  FailureAndRetry as failureAndRetry,
  LateCompletionIgnoredAfterProfileEnvironmentTransition as lateCompletionIgnored,
  OwnerOptionsAndSuccess as ownerOptionsAndSuccess,
} from './ProfileDefaultPostVisibilityControl.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Profile Default Post Visibility Control/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const OwnerOptionsAndSuccess: Story = ownerOptionsAndSuccess;
export const FailureAndRetry: Story = failureAndRetry;
export const LateCompletionIgnoredAfterProfileEnvironmentTransition: Story = lateCompletionIgnored;
