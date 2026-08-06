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
      trailing?: ReactNode;
      variant: 'brand';
    };

export function PageHeader(props: PageHeaderProps) {
  const theme = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: theme.background, borderColor: theme.border }]}>
      {props.variant === 'brand' ? (
        <>
          <View style={styles.brandActionSlot}>{props.leading}</View>
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
          <View style={styles.brandActionSlot} testID="page-header-trailing-slot">
            {props.trailing}
          </View>
        </>
      ) : (
        <>
          {props.leading ? <View style={styles.leading}>{props.leading}</View> : null}
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
            {props.title}
          </Text>
        </>
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
  leading: {
    alignItems: 'center',
    flexDirection: 'row',
    marginRight: spacing.lg,
    zIndex: 1,
  },
  brandActionSlot: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
    zIndex: 1,
  },
  brand: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    pointerEvents: 'none',
  },
  title: {
    flexShrink: 1,
    fontFamily: 'SUIT',
    fontWeight: '700',
    minWidth: 0,
    ...typography.xl,
  },
  srOnly: { height: 1, overflow: 'hidden', position: 'absolute', width: 1 },
});
