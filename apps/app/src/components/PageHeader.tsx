import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';
import { BrandLogo } from './BrandLogo';
import { NavigationLink } from './shell/NavigationLink';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';

type PageHeaderProps =
  | {
      leading?: ReactNode;
      title: string;
      trailing?: ReactNode;
      variant?: 'text';
    }
  | {
      accessibilityLabel: string;
      brandAccessibilityLabel?: string;
      brandHref?: Href;
      leading?: ReactNode;
      onBrandCurrentNavigate?: () => void;
      trailing?: ReactNode;
      variant: 'brand';
    };

export function PageHeader(props: PageHeaderProps) {
  const theme = useTheme();
  const mark = (
    <View
      accessibilityElementsHidden
      accessible={false}
      aria-hidden
      importantForAccessibility="no-hide-descendants"
    >
      <BrandLogo variant="mark" width={38} />
    </View>
  );

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.backgroundCanvas, borderColor: theme.borderSubtle },
      ]}
    >
      {props.variant === 'brand' ? (
        <>
          <View style={styles.brandActionSlot}>{props.leading}</View>
          <View style={[styles.brand, props.brandHref ? null : styles.staticBrand]}>
            {props.brandHref ? (
              <NavigationLink
                href={props.brandHref}
                onCurrentNavigate={props.onBrandCurrentNavigate}
              >
                <Pressable
                  accessibilityLabel={props.brandAccessibilityLabel ?? props.accessibilityLabel}
                  accessibilityRole="link"
                  style={styles.brandControl}
                >
                  {mark}
                </Pressable>
              </NavigationLink>
            ) : (
              mark
            )}
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
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: theme.foregroundPrimary }]}
          >
            {props.title}
          </Text>
          {props.trailing ? <View style={styles.trailing}>{props.trailing}</View> : null}
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
  },
  brandControl: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  staticBrand: {
    pointerEvents: 'none',
  },
  title: {
    flexShrink: 1,
    fontFamily: 'SUIT',
    fontWeight: '700',
    minWidth: 0,
    ...typography.xl,
  },
  trailing: {
    alignItems: 'center',
    flexShrink: 0,
    marginLeft: 'auto',
    zIndex: 1,
  },
  srOnly: {
    height: 1,
    overflow: 'hidden',
    pointerEvents: 'none',
    position: 'absolute',
    width: 1,
  },
});
