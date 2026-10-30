import baseMeta, {
  CallerPendingContract as callerPendingContract,
  InteractionContract as interactionContract,
  LongMessage320Contract as longMessage320Contract,
  OptionalControlsContract as optionalControlsContract,
  PlainContract as plainContract,
} from './Banner.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Banner/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;
export const PlainContract: Story = plainContract;
export const LongMessage320Contract: Story = longMessage320Contract;
export const CallerPendingContract: Story = callerPendingContract;
export const OptionalControlsContract: Story = optionalControlsContract;
