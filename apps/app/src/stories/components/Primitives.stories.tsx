import { StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/StateView';
import { radius, semanticColors, space } from '@/theme/tokens';
import { Catalog, Row, Section } from '../StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';

function PrimitivesCatalog() {
  return (
    <Catalog>
      <Section title="Avatar fallback across sizes and backgrounds">
        <View
          style={[styles.avatarPreview, { backgroundColor: semanticColors.light.backgroundCanvas }]}
        >
          <AvatarSizes />
        </View>
        <View
          style={[styles.avatarPreview, { backgroundColor: semanticColors.dark.backgroundCanvas }]}
        >
          <AvatarSizes />
        </View>
      </Section>

      <Section title="Button tones and states">
        <Row>
          <Button onPress={() => undefined}>기본</Button>
          <Button onPress={() => undefined} tone="secondary">
            보조
          </Button>
          <Button onPress={() => undefined} tone="danger">
            위험
          </Button>
          <Button disabled>비활성</Button>
          <Button loading>처리 중</Button>
        </Row>
      </Section>

      <Section title="Loading placeholders">
        <View style={{ gap: space[8] }}>
          <Skeleton circular height={48} width={48} />
          <Skeleton height={80} />
          <Skeleton width="70%" />
          <Skeleton width="45%" />
        </View>
      </Section>
    </Catalog>
  );
}

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
  avatarPreview: {
    borderRadius: radius[12],
    padding: space[16],
  },
});

const meta = {
  component: PrimitivesCatalog,
  title: 'KOSMO/Components/Primitives/Catalog',
} satisfies Meta<typeof PrimitivesCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Light: Story = {};
export const Dark: Story = {
  globals: { backgrounds: { value: 'kosmoDark' }, theme: 'dark' },
};
