import { StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { radius, semanticColors, space } from '@/theme/tokens';
import { Catalog, Row, Section } from '../StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  args: { label: '코스모', size: 40 },
  component: Avatar,
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Avatar',
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: { controls: { disable: false, include: ['imageUri', 'label', 'size'] } },
};

export const SizesAndBackgrounds: Story = {
  render: () => (
    <Catalog>
      <Section title="Fallback sizes and backgrounds">
        <View style={[styles.preview, { backgroundColor: semanticColors.light.backgroundCanvas }]}>
          <AvatarSizes />
        </View>
        <View style={[styles.preview, { backgroundColor: semanticColors.dark.backgroundCanvas }]}>
          <AvatarSizes />
        </View>
      </Section>
    </Catalog>
  ),
};

function AvatarSizes() {
  return (
    <Row>
      {[24, 32, 40, 48, 64].map((size) => (
        <Avatar key={size} label="코스모" size={size} />
      ))}
    </Row>
  );
}

const styles = StyleSheet.create({
  preview: { borderRadius: radius[12], padding: space[16] },
});
