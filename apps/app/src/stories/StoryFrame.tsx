import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { space, textStyles } from '@/theme/tokens';
import type { PropsWithChildren, ReactNode } from 'react';

export function Catalog({ children, width = 600 }: PropsWithChildren<{ width?: number }>) {
  return <View style={[styles.catalog, { maxWidth: width }]}>{children}</View>;
}

export function Section({ children, title }: { children: ReactNode; title: string }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: theme.foregroundSecondary }]}>{title}</Text>
      {children}
    </View>
  );
}

export function Row({ children }: PropsWithChildren) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  catalog: { alignSelf: 'center', gap: space[32], width: '100%' },
  section: { gap: space[12] },
  heading: {
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    ...textStyles.uiLabelS,
  },
  row: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: space[12] },
});
