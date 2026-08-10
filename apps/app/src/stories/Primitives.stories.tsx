import { StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Skeleton, StateView } from '@/components/ui/StateView';
import { TextArea, TextField } from '@/components/ui/TextField';
import { radius, semanticColors, space } from '@/theme/tokens';
import { Catalog, Row, Section } from './StoryFrame';
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

      <Section title="Text fields">
        <TextField label="기본 입력" placeholder="Placeholder..." />
        <TextField defaultValue="입력된 값" label="입력 완료" />
        <TextField error="입력값을 확인해 주세요." label="오류" value="잘못된 값" />
        <TextField editable={false} label="비활성" value="수정할 수 없는 값" />
        <TextArea label="여러 줄 입력" multiline placeholder="본문을 입력하세요." />
      </Section>

      <Section title="Loading placeholders">
        <View style={{ gap: space[8] }}>
          <Skeleton height={80} />
          <Skeleton width="70%" />
          <Skeleton width="45%" />
        </View>
      </Section>

      <Section title="Loading, empty, error">
        <StateView loading title="불러오는 중입니다." />
        <StateView description="첫 항목이 생기면 여기에 표시돼요." title="아직 항목이 없어요" />
        <StateView
          actionLabel="다시 시도"
          alert
          description="잠시 후 다시 시도해 주세요."
          onAction={() => undefined}
          title="불러오지 못했어요"
        />
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
  title: 'KOSMO/Foundations/Primitives',
} satisfies Meta<typeof PrimitivesCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Light: Story = {};
export const Dark: Story = {
  globals: { backgrounds: { value: 'kosmoDark' }, theme: 'dark' },
};
export const ReducedMotion: Story = {
  globals: { reduceMotion: true },
};
