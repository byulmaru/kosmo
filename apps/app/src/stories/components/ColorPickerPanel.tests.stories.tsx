import baseMeta, {
  MidpointPointerNoOp as midpointPointerNoOp,
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
