import { StyleSheet } from 'react-native';
import { PaginationScrollView } from '@/components/pagination/PaginationScrollView';
import type { ReactNode } from 'react';
import type { TabReselectionDestination } from '@/components/shell/ShellChromeContext';

export function ProfileRouteContainer({
  children,
  reselectDestination,
  scrollKey,
}: {
  children: ReactNode;
  reselectDestination?: TabReselectionDestination;
  scrollKey: string;
}) {
  return (
    <PaginationScrollView
      key={scrollKey}
      nativeScrollProps={{ style: styles.nativeRoot }}
      reselectDestination={reselectDestination}
      webStyle={styles.webRoot}
    >
      {children}
    </PaginationScrollView>
  );
}

const styles = StyleSheet.create({
  nativeRoot: { flex: 1 },
  webRoot: { width: '100%' },
});
