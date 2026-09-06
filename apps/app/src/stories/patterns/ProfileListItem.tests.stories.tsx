import baseMeta, {
  LayoutContract as layoutContract,
  ListMobileGeometryContract as listMobileGeometryContract,
} from './ProfileListItem.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  excludeStories: [],
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Patterns/ProfileListItem/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const LayoutContract: Story = layoutContract;
export const ListMobileGeometryContract: Story = listMobileGeometryContract;
