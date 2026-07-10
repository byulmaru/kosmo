import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import type { PropsWithChildren, ReactNode } from 'react';

export function Catalog({ children, width = 600 }: PropsWithChildren<{ width?: number }>) {
  return <View style={[styles.catalog, { maxWidth: width }]}>{children}</View>;
}

export function Section({ children, title }: { children: ReactNode; title: string }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: theme.textSecondary }]}>{title}</Text>
      {children}
    </View>
  );
}

export function Row({ children }: PropsWithChildren) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  catalog: { alignSelf: 'center', gap: spacing.xxl, width: '100%' },
  section: { gap: spacing.md },
  heading: {
    fontFamily: 'SUIT',
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    ...typography.xsm,
  },
  row: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
