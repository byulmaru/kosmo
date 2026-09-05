import baseMeta, {
  CompactClosedUnreadContract as compactClosedUnreadContract,
  EscapeDismissContract as escapeDismissContract,
  InteractionContract as interactionContract,
  LongListContract as longListContract,
  OpenUnreadContract as openUnreadContract,
  OutsideDismissContract as outsideDismissContract,
  SelectionFailureContract as selectionFailureContract,
  WideClosedUnreadContract as wideClosedUnreadContract,
} from './ProfileSwitcher.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/Profile Switcher/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;
export const SelectionFailureContract: Story = selectionFailureContract;
export const EscapeDismissContract: Story = escapeDismissContract;
export const OutsideDismissContract: Story = outsideDismissContract;
export const LongListContract: Story = longListContract;
export const WideClosedUnreadContract: Story = wideClosedUnreadContract;
export const CompactClosedUnreadContract: Story = compactClosedUnreadContract;
export const OpenUnreadContract: Story = openUnreadContract;
