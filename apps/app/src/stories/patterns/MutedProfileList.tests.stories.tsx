import baseMeta, {
  FailureContract as failure,
  PaginationContract as pagination,
  RetryContract as retry,
  UnmuteContract as unmute,
} from './MutedProfileList.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/Profile/Muted Profiles/Tests',
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const UnmuteContract: Story = unmute;
export const FailureContract: Story = failure;
export const RetryContract: Story = retry;
export const PaginationContract: Story = pagination;
