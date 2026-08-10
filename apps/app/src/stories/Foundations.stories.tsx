import { StyleSheet, Text, View } from 'react-native';
import { BrandLogo } from '@/components/BrandLogo';
import { useElevation, useTheme, useThemeMode } from '@/theme/ThemeProvider';
import {
  borderWidths,
  breakpoints,
  iconSizes,
  motion,
  radius,
  semanticColors,
  space,
  textStyles,
} from '@/theme/tokens';
import { Catalog, Row, Section } from './StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';

function FoundationsCatalog() {
  const theme = useTheme();
  const mode = useThemeMode();
  const elevation = useElevation();

  return (
    <Catalog width={880}>
      <Section title="Brand logo">
        <Row>
          <BrandLogo width={96} />
          <BrandLogo variant="full" width={220} />
        </Row>
      </Section>

      <Section title="Color tokens">
        <Row>
          {Object.entries(semanticColors[mode]).map(([name, value]) => (
            <View key={name} style={styles.token}>
              <View style={[styles.swatch, { backgroundColor: value }]} />
              <Text style={[styles.name, { color: theme.foregroundPrimary }]}>{name}</Text>
              <Text style={[styles.value, { color: theme.foregroundSecondary }]}>{value}</Text>
            </View>
          ))}
        </Row>
      </Section>

      <Section title="Typography">
        {Object.entries(textStyles).map(([name, value]) => (
          <Text key={name} style={[styles.type, value, { color: theme.foregroundPrimary }]}>
            {name} · 코스모는 사람과 우주를 잇습니다.
          </Text>
        ))}
      </Section>

      <Section title="Spacing and radius">
        <Row>
          {Object.entries(space).map(([name, value]) => (
            <View key={name} style={styles.measure}>
              <View
                style={{ backgroundColor: theme.actionPrimaryBase, height: value, width: value }}
              />
              <Text style={[styles.value, { color: theme.foregroundSecondary }]}>
                {name} {value}
              </Text>
            </View>
          ))}
        </Row>
        <Row>
          {Object.entries(radius).map(([name, value]) => (
            <View
              key={name}
              style={[
                styles.radius,
                { backgroundColor: theme.backgroundSurface, borderRadius: value },
              ]}
            >
              <Text style={[styles.value, { color: theme.foregroundSecondary }]}>{name}</Text>
            </View>
          ))}
        </Row>
        <Row>
          {Object.entries(borderWidths).map(([name, value]) => (
            <View
              key={name}
              style={[styles.border, { borderColor: theme.borderFocus, borderWidth: value }]}
            >
              <Text style={[styles.value, { color: theme.foregroundSecondary }]}>{name}</Text>
            </View>
          ))}
        </Row>
      </Section>

      <Section title="Elevation and icon sizes">
        <Row>
          {Object.entries(elevation).map(([name, value]) => (
            <View
              key={name}
              style={[styles.elevation, value, { backgroundColor: theme.backgroundElevated }]}
            >
              <Text style={[styles.value, { color: theme.foregroundPrimary }]}>{name}</Text>
            </View>
          ))}
        </Row>
        <Row>
          {Object.entries(iconSizes).map(([name, value]) => (
            <View
              key={name}
              style={[
                styles.icon,
                { height: value, width: value, borderColor: theme.borderStrong },
              ]}
            />
          ))}
        </Row>
      </Section>

      <Section title="Motion tokens">
        {Object.entries(motion.duration).map(([name, value]) => (
          <Text key={name} style={[styles.value, { color: theme.foregroundPrimary }]}>
            {name} · {value}ms
          </Text>
        ))}
      </Section>

      <Section title="Universal breakpoints">
        <Text style={[styles.type, { color: theme.foregroundPrimary }]}>mobile · 0–767</Text>
        <Text style={[styles.type, { color: theme.foregroundPrimary }]}>
          compact · {breakpoints.compact}–1279
        </Text>
        <Text style={[styles.type, { color: theme.foregroundPrimary }]}>
          full · {breakpoints.full}+
        </Text>
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

export const Light: Story = {};
export const Dark: Story = {
  globals: { backgrounds: { value: 'kosmoDark' }, theme: 'dark' },
};

const styles = StyleSheet.create({
  border: { alignItems: 'center', height: 48, justifyContent: 'center', width: 96 },
  elevation: {
    alignItems: 'center',
    borderRadius: radius[12],
    height: 72,
    justifyContent: 'center',
    width: 132,
  },
  icon: { borderRadius: radius[2], borderWidth: borderWidths[2] },
  measure: { alignItems: 'center', gap: space[4], minWidth: 64 },
  name: textStyles.uiLabelS,
  radius: { alignItems: 'center', height: 72, justifyContent: 'center', width: 96 },
  swatch: { borderRadius: radius[12], borderWidth: borderWidths[1], height: 72, width: 96 },
  token: { gap: space[4], width: 140 },
  type: textStyles.uiCopyM,
  value: textStyles.uiCopyS,
});
