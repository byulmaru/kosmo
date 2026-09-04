import baseMeta, {
  CompactClosedUnreadContract as compactClosedUnreadContract,
  InteractionContract as interactionContract,
  OpenUnreadContract as openUnreadContract,
  WideClosedUnreadContract as wideClosedUnreadContract,
} from './ProfileSwitcher.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Patterns/Profile Switcher/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;
export const WideClosedUnreadContract: Story = wideClosedUnreadContract;
export const CompactClosedUnreadContract: Story = compactClosedUnreadContract;
export const OpenUnreadContract: Story = openUnreadContract;
