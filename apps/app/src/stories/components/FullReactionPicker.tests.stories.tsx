import baseMeta, {
  InteractionContract as interactionContract,
  LoadingContract as loadingContract,
  MobileBrowseGeometryContract as mobileBrowseGeometryContract,
  MobileExpandedGeometryContract as mobileExpandedGeometryContract,
  MobileGridGeometryContract as mobileGridGeometryContract,
  MobileRecentGridContract as mobileRecentGridContract,
  RecentGridContract as recentGridContract,
  WebGridGeometryContract as webGridGeometryContract,
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
export const LoadingContract: Story = loadingContract;
export const MobileGridGeometryContract: Story = mobileGridGeometryContract;
export const MobileBrowseGeometryContract: Story = mobileBrowseGeometryContract;
export const MobileExpandedGeometryContract: Story = mobileExpandedGeometryContract;
export const MobileRecentGridContract: Story = mobileRecentGridContract;
export const RecentGridContract: Story = recentGridContract;
export const WebGridGeometryContract: Story = webGridGeometryContract;
