import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { breakpoints, colors, radii, spacing, typography } from '@/theme/tokens';
import { Catalog, Row, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';

function FoundationsCatalog() {
  const theme = useTheme();

  return (
    <Catalog width={880}>
      <Section title="Color tokens">
        <Row>
          {Object.entries(colors.light).map(([name, value]) => (
            <View key={name} style={styles.token}>
              <View style={[styles.swatch, { backgroundColor: value }]} />
              <Text style={[styles.name, { color: theme.text }]}>{name}</Text>
              <Text style={[styles.value, { color: theme.textSecondary }]}>{value}</Text>
            </View>
          ))}
        </Row>
      </Section>

      <Section title="Typography">
        {Object.entries(typography).map(([name, value]) => (
          <Text key={name} style={[styles.type, value, { color: theme.text }]}>
            {name} · 코스모는 사람과 우주를 잇습니다.
          </Text>
        ))}
      </Section>

      <Section title="Spacing and radius">
        <Row>
          {Object.entries(spacing).map(([name, value]) => (
            <View key={name} style={styles.measure}>
              <View style={{ backgroundColor: theme.primary, height: value, width: value }} />
              <Text style={[styles.value, { color: theme.textSecondary }]}>
                {name} {value}
              </Text>
            </View>
          ))}
        </Row>
        <Row>
          {Object.entries(radii).map(([name, value]) => (
            <View
              key={name}
              style={[styles.radius, { backgroundColor: theme.surface, borderRadius: value }]}
            >
              <Text style={[styles.value, { color: theme.textSecondary }]}>{name}</Text>
            </View>
          ))}
        </Row>
      </Section>

      <Section title="Universal breakpoints">
        <Text style={[styles.type, { color: theme.text }]}>mobile · 0–767</Text>
        <Text style={[styles.type, { color: theme.text }]}>
          compact · {breakpoints.compact}–1279
        </Text>
        <Text style={[styles.type, { color: theme.text }]}>full · {breakpoints.full}+</Text>
      </Section>
    </Catalog>
  );
}

const meta = {
  component: FoundationsCatalog,
  parameters: { layout: 'fullscreen' },
  title: 'KOSMO/Foundations/Tokens',
} satisfies Meta<typeof FoundationsCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TokensAndBreakpoints: Story = {};

const styles = StyleSheet.create({
  measure: { alignItems: 'center', gap: spacing.xs, minWidth: 64 },
  name: { fontFamily: 'SUIT', fontWeight: '700', ...typography.xsm },
  radius: { alignItems: 'center', height: 72, justifyContent: 'center', width: 96 },
  swatch: { borderRadius: radii.md, borderWidth: 1, height: 72, width: 96 },
  token: { gap: spacing.xs, width: 112 },
  type: { fontFamily: 'SUIT' },
  value: { fontFamily: 'SUIT', ...typography.xsm },
});
