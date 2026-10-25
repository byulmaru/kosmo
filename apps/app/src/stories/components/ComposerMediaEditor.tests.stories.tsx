import baseMeta, {
  AltTextCodePointLimitContract as altTextCodePointLimitContract,
  FeatureFlagOffContract as featureFlagOffContract,
  FutureImageEditPreviewContract as futureImageEditPreviewContract,
  InteractionContract as interactionContract,
  MobileAltKeyboardGeometryContract as mobileAltKeyboardGeometryContract,
  MobileDefaultGeometryContract as mobileDefaultGeometryContract,
  MobileFeatureFlagOffContract as mobileFeatureFlagOffContract,
  MobileNightshadeGeometryContract as mobileNightshadeGeometryContract,
  MobileSensitiveGeometryContract as mobileSensitiveGeometryContract,
  MobileStaleFeatureFlagDropContract as mobileStaleFeatureFlagDropContract,
  MobileToolInteractionContract as mobileToolInteractionContract,
  PlaygroundMobileViewportContract as playgroundMobileViewportContract,
  StaleFeatureFlagDropContract as staleFeatureFlagDropContract,
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
export const AltTextCodePointLimitContract: Story = altTextCodePointLimitContract;
export const FutureImageEditPreviewContract: Story = futureImageEditPreviewContract;
export const FeatureFlagOffContract: Story = featureFlagOffContract;
export const MobileAltKeyboardGeometryContract: Story = mobileAltKeyboardGeometryContract;
export const MobileDefaultGeometryContract: Story = mobileDefaultGeometryContract;
export const MobileFeatureFlagOffContract: Story = mobileFeatureFlagOffContract;
export const MobileNightshadeGeometryContract: Story = mobileNightshadeGeometryContract;
export const MobileStaleFeatureFlagDropContract: Story = mobileStaleFeatureFlagDropContract;
export const MobileSensitiveGeometryContract: Story = mobileSensitiveGeometryContract;
export const MobileToolInteractionContract: Story = mobileToolInteractionContract;
export const PlaygroundMobileViewportContract: Story = playgroundMobileViewportContract;
export const StaleFeatureFlagDropContract: Story = staleFeatureFlagDropContract;
export const WideImagePreviewContract: Story = wideImagePreviewContract;
