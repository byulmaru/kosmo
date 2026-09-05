import baseMeta, {
  FailureContract as failure,
  InitialRetryContract as initialRetry,
  LastRowRemovalFocusContract as lastRowRemovalFocus,
  LoadMoreContract as loadMore,
  PaginationRetryContract as paginationRetry,
  SuccessContract as success,
} from './BlockedProfileList.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/Profile/Blocked Profiles/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const SuccessContract: Story = success;
export const LastRowRemovalFocusContract: Story = lastRowRemovalFocus;
export const FailureContract: Story = failure;
export const InitialRetryContract: Story = initialRetry;
export const PaginationRetryContract: Story = paginationRetry;
export const LoadMoreContract: Story = loadMore;
