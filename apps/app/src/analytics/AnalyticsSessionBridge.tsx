import { useEffect } from 'react';
import { usePathname, useSegments } from 'expo-router';
import { useAnalyticsIdentityAccountId, useSession } from '@/session/SessionProvider';
import {
  clearAnalytics,
  identifyAnalytics,
  setAnalyticsSelectedProfile,
  trackAnalyticsScreen,
} from './client';

export function AnalyticsSessionBridge(): null {
  const pathname = usePathname();
  const segments = useSegments();
  const accountId = useAnalyticsIdentityAccountId();
  const { accountId: visibleAccountId, selectedProfileId, status } = useSession();
  const screenName = `/${segments
    .filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')))
    .join('/')}`;

  useEffect(() => {
    if (!accountId) {
      setAnalyticsSelectedProfile(null, null);
      clearAnalytics();
      return;
    }
    setAnalyticsSelectedProfile(
      accountId,
      status === 'valid' && visibleAccountId === accountId ? selectedProfileId : null,
    );
    identifyAnalytics(accountId);
  }, [accountId, selectedProfileId, status, visibleAccountId]);

  useEffect(() => {
    trackAnalyticsScreen(screenName);
  }, [pathname, screenName]);

  return null;
}
