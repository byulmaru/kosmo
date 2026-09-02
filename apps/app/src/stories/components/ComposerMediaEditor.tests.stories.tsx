import baseMeta, {
  InteractionContract as interactionContract,
  MobileAltKeyboardGeometryContract as mobileAltKeyboardGeometryContract,
  MobileDefaultGeometryContract as mobileDefaultGeometryContract,
  MobileSensitiveGeometryContract as mobileSensitiveGeometryContract,
  MobileToolInteractionContract as mobileToolInteractionContract,
} from './ComposerMediaEditor.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Composer Media Editor/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;
export const MobileAltKeyboardGeometryContract: Story = mobileAltKeyboardGeometryContract;
export const MobileDefaultGeometryContract: Story = mobileDefaultGeometryContract;
export const MobileSensitiveGeometryContract: Story = mobileSensitiveGeometryContract;
export const MobileToolInteractionContract: Story = mobileToolInteractionContract;
