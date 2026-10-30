import { StyleSheet, Text, View } from 'react-native';
import { BrandLogo } from '@/components/BrandLogo';
import { useTheme } from '@/theme/ThemeProvider';
import { breakpoints, space, textStyles } from '@/theme/tokens';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export function FirstProfileOnboardingFrame({
  actions,
  children,
  description,
  headerAction,
  progress,
  style,
  title,
}: {
  actions: ReactNode;
  children: ReactNode;
  description?: string;
  headerAction?: ReactNode;
  progress?: ReactNode;
  style?: StyleProp<ViewStyle>;
  title: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.content, style]}>
      <View style={styles.header}>
        <BrandLogo width={38} />
        <View style={styles.spacer} />
        {headerAction}
      </View>
      {progress}
      <View style={styles.heading}>
        <Text
          accessibilityRole="header"
          style={[textStyles.uiHeadingM, { color: theme.foregroundPrimary }]}
        >
          {title}
        </Text>
        {description ? (
          <Text style={[textStyles.uiCopyL, { color: theme.foregroundSecondary }]}>
            {description}
          </Text>
        ) : null}
      </View>
      {children}
      <View style={styles.actions}>{actions}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space[24],
    maxWidth: breakpoints.compact,
    padding: space[24],
    paddingBottom: space[48],
    width: '100%',
  },
  header: { alignItems: 'center', flexDirection: 'row', gap: space[12] },
  spacer: { flex: 1, minWidth: 0 },
  heading: { gap: space[12] },
  actions: { gap: space[12] },
});
