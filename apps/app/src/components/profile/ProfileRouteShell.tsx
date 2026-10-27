import { createContext, useContext } from 'react';
import { StyleSheet } from 'react-native';
import { PaginationScrollView } from '@/components/pagination/PaginationScrollView';
import type { ReactNode } from 'react';
import type { PreloadedQuery } from 'react-relay';
import type { ProfilePostListPageQuery as ProfilePostListPageQueryType } from '@/app/(tabs)/(profile)/[profileHandle]/__generated__/ProfilePostListPageQuery.graphql';
import type { TabReselectionDestination } from '@/components/shell/ShellChromeContext';

type ProfileRouteContextValue = Readonly<{
  chrome: ReactNode;
  postsQueryReference: PreloadedQuery<ProfilePostListPageQueryType> | null;
  retryPosts: () => void;
  scrollKey: string;
}>;

const ProfileRouteContext = createContext<ProfileRouteContextValue | null>(null);

export function ProfileRouteProvider({
  children,
  chrome,
  postsQueryReference,
  retryPosts,
  scrollKey,
}: ProfileRouteContextValue & { children: ReactNode }) {
  return (
    <ProfileRouteContext.Provider value={{ chrome, postsQueryReference, retryPosts, scrollKey }}>
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
