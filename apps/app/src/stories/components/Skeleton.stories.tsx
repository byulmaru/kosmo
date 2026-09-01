import { StyleSheet, View } from 'react-native';
import { Skeleton } from '@/components/ui/StateView';
import { space } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  args: { circular: false, height: 20 },
  argTypes: {
    height: { control: { max: 320, min: 1, step: 1, type: 'number' } },
    width: { control: { max: 640, min: 1, step: 1, type: 'number' } },
  },
  component: Skeleton,
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Skeleton',
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    controls: { disable: false, include: ['circular', 'height', 'width'] },
  },
};

export const RepresentativeStates: Story = {
  render: () => (
    <View style={styles.catalog}>
      <Skeleton circular height={48} width={48} />
      <Skeleton height={80} />
      <Skeleton width="70%" />
      <Skeleton width="45%" />
    </View>
  ),
};

const styles = StyleSheet.create({
  catalog: { gap: space[8] },
});
