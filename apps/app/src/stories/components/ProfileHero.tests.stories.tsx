import baseMeta, {
  CenterGeometryContract as centerGeometryContract,
  ImageAndTagsContract as imageAndTagsContract,
  LoadingGeometryContract as loadingGeometryContract,
  MobileGeometryContract as mobileGeometryContract,
  MuteContract as muteContract,
  MutedLoadingContract as mutedLoadingContract,
} from './ProfileHero.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Components/ProfileHero/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const CenterGeometryContract: Story = centerGeometryContract;
export const MobileGeometryContract: Story = mobileGeometryContract;
export const LoadingGeometryContract: Story = loadingGeometryContract;
export const ImageAndTagsContract: Story = imageAndTagsContract;

export const MuteContract: Story = muteContract;
export const MutedLoadingContract: Story = mutedLoadingContract;
