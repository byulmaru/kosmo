import baseMeta, {
  ControlsContract as controlsContract,
  FutureImageEditPreviewContract as futureImageEditPreviewContract,
  InteractionContract as interactionContract,
  MobileAltKeyboardGeometryContract as mobileAltKeyboardGeometryContract,
  MobileDefaultGeometryContract as mobileDefaultGeometryContract,
  MobileSensitiveGeometryContract as mobileSensitiveGeometryContract,
  MobileToolInteractionContract as mobileToolInteractionContract,
  PlaygroundMobileViewportContract as playgroundMobileViewportContract,
  WideImagePreviewContract as wideImagePreviewContract,
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
export const FutureImageEditPreviewContract: Story = futureImageEditPreviewContract;
export const MobileAltKeyboardGeometryContract: Story = mobileAltKeyboardGeometryContract;
export const MobileDefaultGeometryContract: Story = mobileDefaultGeometryContract;
export const MobileSensitiveGeometryContract: Story = mobileSensitiveGeometryContract;
export const MobileToolInteractionContract: Story = mobileToolInteractionContract;
export const ControlsContract: Story = controlsContract;
export const PlaygroundMobileViewportContract: Story = playgroundMobileViewportContract;
export const WideImagePreviewContract: Story = wideImagePreviewContract;
