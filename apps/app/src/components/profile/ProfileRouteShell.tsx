import { createContext, useContext } from 'react';
import { StyleSheet } from 'react-native';
import { PaginationScrollView } from '@/components/pagination/PaginationScrollView';
import type { ReactNode } from 'react';

type ProfileRouteContextValue = Readonly<{
  chrome: ReactNode;
  scrollKey: string;
}>;

const ProfileRouteContext = createContext<ProfileRouteContextValue | null>(null);

export function ProfileRouteProvider({
  children,
  chrome,
  scrollKey,
}: ProfileRouteContextValue & { children: ReactNode }) {
  return (
    <ProfileRouteContext.Provider value={{ chrome, scrollKey }}>
      {children}
    </ProfileRouteContext.Provider>
  );
}

export function useProfileRoute(): ProfileRouteContextValue {
  const value = useContext(ProfileRouteContext);
  if (!value) {
    throw new Error('useProfileRoute must be used inside ProfileRouteProvider.');
  }
  return value;
}

export function ProfileRouteContainer({
  children,
  scrollKey,
}: {
  children: ReactNode;
  scrollKey: string;
}) {
  return (
    <PaginationScrollView
      key={scrollKey}
      nativeScrollProps={{ style: styles.nativeRoot }}
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
