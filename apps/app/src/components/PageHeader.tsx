import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';
import { BrandLogo } from './BrandLogo';
import type { ReactNode } from 'react';

type PageHeaderProps =
  | {
      leading?: ReactNode;
      title: string;
      variant?: 'text';
    }
  | {
      accessibilityLabel: string;
      leading?: ReactNode;
      variant: 'brand';
    };

export function PageHeader(props: PageHeaderProps) {
  const theme = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: theme.background, borderColor: theme.border }]}>
      {props.leading ? <View style={styles.leading}>{props.leading}</View> : null}
      {props.variant === 'brand' ? (
        <View style={styles.brand}>
          <View
            accessibilityElementsHidden
            accessible={false}
            aria-hidden
            importantForAccessibility="no-hide-descendants"
          >
            <BrandLogo variant="mark" width={38} />
          </View>
          <Text accessibilityRole="header" style={styles.srOnly}>
            {props.accessibilityLabel}
          </Text>
        </View>
      ) : (
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
          {props.title}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    position: 'relative',
    width: '100%',
  },
  leading: { alignItems: 'center', flexDirection: 'row', zIndex: 1 },
  brand: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    pointerEvents: 'none',
    right: 0,
    top: 0,
  },
  title: { fontFamily: 'SUIT', fontWeight: '700', ...typography.xl },
  srOnly: { height: 1, overflow: 'hidden', position: 'absolute', width: 1 },
});
