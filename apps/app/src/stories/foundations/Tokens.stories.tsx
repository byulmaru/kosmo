import { StyleSheet, Text, View } from 'react-native';
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
import { Catalog, Row, Section } from '../StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';

const meta = {
  parameters: { controls: { disable: true }, layout: 'fullscreen' },
  title: 'KOSMO/Foundations/Tokens',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Color: Story = { render: () => <ColorTokens /> };

export const Typography: Story = { render: () => <TypographyTokens /> };

export const SpacingRadius: Story = {
  name: 'Spacing & Radius',
  render: () => <SpacingRadiusTokens />,
};

export const ElevationIcon: Story = {
  name: 'Elevation & Icon',
  render: () => <ElevationIconTokens />,
};

export const Motion: Story = { render: () => <MotionTokens /> };

export const Breakpoints: Story = { render: () => <BreakpointTokens /> };

function TokenSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <Catalog width={880}>
      <Section title={title}>{children}</Section>
    </Catalog>
  );
}

function ColorTokens() {
  const theme = useTheme();
  const mode = useThemeMode();

  return (
    <TokenSection title="Color tokens">
      <Row>
        {Object.entries(semanticColors[mode]).map(([name, value]) => (
          <View key={name} style={styles.token}>
            <View style={[styles.swatch, { backgroundColor: value }]} />
            <Text style={[styles.name, { color: theme.foregroundPrimary }]}>{name}</Text>
            <Text style={[styles.value, { color: theme.foregroundSecondary }]}>{value}</Text>
          </View>
        ))}
      </Row>
    </TokenSection>
  );
}

function TypographyTokens() {
  const theme = useTheme();

  return (
    <TokenSection title="Typography">
      {Object.entries(textStyles).map(([name, value]) => (
        <Text key={name} style={[styles.type, value, { color: theme.foregroundPrimary }]}>
          {name} · 코스모는 사람과 우주를 잇습니다.
        </Text>
      ))}
    </TokenSection>
  );
}

function SpacingRadiusTokens() {
  const theme = useTheme();

  return (
    <TokenSection title="Spacing and radius">
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
    </TokenSection>
  );
}

function ElevationIconTokens() {
  const theme = useTheme();
  const elevation = useElevation();

  return (
    <TokenSection title="Elevation and icon sizes">
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
            style={[styles.icon, { borderColor: theme.borderStrong, height: value, width: value }]}
          />
        ))}
      </Row>
    </TokenSection>
  );
}

function MotionTokens() {
  const theme = useTheme();

  return (
    <TokenSection title="Motion tokens">
      {Object.entries(motion.duration).map(([name, value]) => (
        <Text key={name} style={[styles.value, { color: theme.foregroundPrimary }]}>
          {name} · {value}ms
        </Text>
      ))}
    </TokenSection>
  );
}

function BreakpointTokens() {
  const theme = useTheme();

  return (
    <TokenSection title="Universal breakpoints">
      <Text style={[styles.type, { color: theme.foregroundPrimary }]}>mobile · 0–767</Text>
      <Text style={[styles.type, { color: theme.foregroundPrimary }]}>
        compact · {breakpoints.compact}–1279
      </Text>
      <Text style={[styles.type, { color: theme.foregroundPrimary }]}>
        full · {breakpoints.full}+
      </Text>
    </TokenSection>
  );
}

const styles = StyleSheet.create({
  border: { alignItems: 'center', height: 48, justifyContent: 'center', width: 96 },
  elevation: {
    alignItems: 'center',
    borderRadius: radius[12],
    height: 72,
    justifyContent: 'center',
    width: 132,
  },
  icon: { borderRadius: radius[4], borderWidth: borderWidths[2] },
  measure: { alignItems: 'center', gap: space[4], minWidth: 64 },
  name: textStyles.uiLabelS,
  radius: { alignItems: 'center', height: 72, justifyContent: 'center', width: 96 },
  swatch: { borderRadius: radius[12], borderWidth: borderWidths[1], height: 72, width: 96 },
  token: { gap: space[4], width: 140 },
  type: textStyles.uiCopyM,
  value: textStyles.uiCopyS,
});
