import baseMeta, {
  FlagAssetContract as flagAssetContract,
  InteractionContract as interactionContract,
  LoadingContract as loadingContract,
  MobileBrowseGeometryContract as mobileBrowseGeometryContract,
  MobileExpandedGeometryContract as mobileExpandedGeometryContract,
  MobileGridGeometryContract as mobileGridGeometryContract,
  MobileHandleExpansionContract as mobileHandleExpansionContract,
  RecentSectionContract as recentSectionContract,
  VirtualizedCatalogContract as virtualizedCatalogContract,
  WebGridGeometryContract as webGridGeometryContract,
  WebMobileGridGeometryContract as webMobileGridGeometryContract,
} from './FullReactionPicker.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  title: 'KOSMO/Components/Full Reaction Picker/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractionContract: Story = interactionContract;
export const FlagAssetContract: Story = flagAssetContract;
export const LoadingContract: Story = loadingContract;
export const MobileGridGeometryContract: Story = mobileGridGeometryContract;
export const MobileBrowseGeometryContract: Story = mobileBrowseGeometryContract;
export const MobileExpandedGeometryContract: Story = mobileExpandedGeometryContract;
export const MobileHandleExpansionContract: Story = mobileHandleExpansionContract;
export const VirtualizedCatalogContract: Story = virtualizedCatalogContract;
export const WebGridGeometryContract: Story = webGridGeometryContract;
export const WebMobileGridGeometryContract: Story = webMobileGridGeometryContract;
export const RecentSectionContract: Story = recentSectionContract;
