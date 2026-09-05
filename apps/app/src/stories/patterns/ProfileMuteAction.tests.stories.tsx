import baseMeta, {
  FailureContract as failure,
  MuteContract as mute,
  PendingContract as pending,
  UnmuteContract as unmute,
} from './ProfileMuteAction.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/Profile/Mute Action/Tests',
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const MuteContract: Story = mute;
export const FailureContract: Story = failure;
export const PendingContract: Story = pending;
export const UnmuteContract: Story = unmute;
