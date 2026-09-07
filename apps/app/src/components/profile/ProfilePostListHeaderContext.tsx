import { createContext, useContext } from 'react';
import type { PropsWithChildren, ReactElement } from 'react';

const ProfilePostListHeaderContext = createContext<ReactElement | null>(null);

export function ProfilePostListHeaderProvider({
  children,
  header,
}: PropsWithChildren<{ header: ReactElement | null }>) {
  return (
    <ProfilePostListHeaderContext.Provider value={header}>
      {children}
    </ProfilePostListHeaderContext.Provider>
  );
}

export function useProfilePostListHeader() {
  return useContext(ProfilePostListHeaderContext);
}
