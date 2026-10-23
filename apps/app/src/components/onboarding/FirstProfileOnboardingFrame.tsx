import { ArrowLeft } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { BrandLogo } from '@/components/BrandLogo';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/theme/ThemeProvider';
import { breakpoints, iconSizes, space, textStyles } from '@/theme/tokens';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export function FirstProfileOnboardingFrame({
  actions,
  children,
  description,
  disabled = false,
  headerAction,
  onBack,
  progress,
  style,
  title,
}: {
  actions: ReactNode;
  children: ReactNode;
  description?: string;
  disabled?: boolean;
  headerAction?: ReactNode;
  onBack: () => void;
  progress?: ReactNode;
  style?: StyleProp<ViewStyle>;
  title: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.content, style]}>
      <View style={styles.header}>
        <IconButton
          accessibilityLabel="이전 화면"
          disabled={disabled}
          onPress={onBack}
          style={styles.back}
          targetSize={48}
        >
          <ArrowLeft color={theme.foregroundPrimary} size={iconSizes[24]} />
        </IconButton>
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
  back: { alignItems: 'center', justifyContent: 'center', height: 48, width: 48 },
  spacer: { flex: 1, minWidth: 0 },
  heading: { gap: space[12] },
  actions: { gap: space[12] },
});
