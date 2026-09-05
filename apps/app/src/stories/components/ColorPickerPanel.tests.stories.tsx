import baseMeta, {
  InteractionContract as interactionContract,
  MidpointPointerNoOp as midpointPointerNoOp,
  ReducedMotionContract as reducedMotionContract,
  SaturationBoundary as saturationBoundary,
} from './ColorPickerPanel.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Color Picker Panel/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const SaturationBoundary: Story = saturationBoundary;
export const MidpointPointerNoOp: Story = midpointPointerNoOp;
export const InteractionContract: Story = interactionContract;
export const ReducedMotionContract: Story = reducedMotionContract;
