import { usePathname } from 'expo-router';
import { createContext, useCallback, useContext, useLayoutEffect, useRef } from 'react';
import { useSession } from '@/session/SessionProvider';
import { identifyAnalytics, trackAnalytics } from './client';
import type { PropsWithChildren } from 'react';

type ScreenAnalytics = {
  onVisibleResults: (hashtagId: string, hasResults: boolean) => void;
  onResultSelected: (hashtagId: string) => void;
};
const ScreenAnalyticsContext = createContext<ScreenAnalytics | null>(null);

// Own only the current visible screen entry, above RelayActorBoundary. There is no exploration
// correlation, terminal outcome, registry, timeout, or handoff to another tab.
export function ProfileHashtagScreenAnalyticsProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const { accountId } = useSession();
  const active = /^\/hashtags\/[^/]+\/profiles\/?$/.test(pathname);
  const entry = useRef<{
    pathname: string;
    accountId: string;
    enteredAt: string;
    initialRecorded: boolean;
    listRecorded: boolean;
  } | null>(null);

  useLayoutEffect(() => {
    if (!active) {
      entry.current = null;
    } else if (
      accountId &&
      (!entry.current ||
        entry.current.pathname !== pathname ||
        entry.current.accountId !== accountId)
    ) {
      entry.current = {
        pathname,
        accountId,
        enteredAt: new Date().toISOString(),
        initialRecorded: false,
        listRecorded: false,
      };
      identifyAnalytics(accountId);
      trackAnalytics('profile_hashtag_screen_entered', {});
    }
  }, [accountId, active, pathname]);

  const onVisibleResults = useCallback(
    (hashtagId: string, hasResults: boolean) => {
      const current = entry.current;
      if (
        !active ||
        !accountId ||
        current?.accountId !== accountId ||
        current.pathname !== pathname
      ) {
        return;
      }
      identifyAnalytics(accountId);
      if (!current.initialRecorded) {
        current.initialRecorded = true;
        trackAnalytics('profile_hashtag_initial_state_viewed', {
          hashtag_id: hashtagId,
          result: hasResults ? 'has_results' : 'empty',
          entered_at: current.enteredAt,
        });
      }
      if (hasResults && !current.listRecorded) {
        current.listRecorded = true;
        trackAnalytics('profile_hashtag_list_viewed', { hashtag_id: hashtagId });
      }
    },
    [accountId, active, pathname],
  );
  const onResultSelected = useCallback(
    (hashtagId: string) => {
      if (
        active &&
        accountId &&
        entry.current?.accountId === accountId &&
        entry.current.pathname === pathname
      ) {
        identifyAnalytics(accountId);
        trackAnalytics('profile_hashtag_profile_selected', { hashtag_id: hashtagId });
      }
    },
    [accountId, active, pathname],
  );

  return (
    <ScreenAnalyticsContext.Provider value={{ onVisibleResults, onResultSelected }}>
      {children}
    </ScreenAnalyticsContext.Provider>
  );
}

export function useProfileHashtagScreenAnalytics(): ScreenAnalytics {
  const value = useContext(ScreenAnalyticsContext);
  if (!value) {
    throw new Error('Profile hashtag analytics needs its shell provider.');
  }
  return value;
}
