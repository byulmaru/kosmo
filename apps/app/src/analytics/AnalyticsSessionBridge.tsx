import { usePathname } from 'expo-router';
import { useEffect, useLayoutEffect } from 'react';
import { Platform } from 'react-native';
import { useSession } from '@/session/SessionProvider';
import { clearAnalytics, identifyAnalytics, observeAnalyticsSession } from './client';
import { searchProfileJourneys } from './searchProfileJourneys';

export function AnalyticsSessionBridge(): null {
  const { accountId, selectedProfileId, status } = useSession();
  const pathname = usePathname();

  useLayoutEffect(() => {
    searchProfileJourneys.setActor(accountId, selectedProfileId, status);
  }, [accountId, selectedProfileId, status]);
  useLayoutEffect(() => searchProfileJourneys.observePath(pathname), [pathname]);
  useEffect(() => observeAnalyticsSession(searchProfileJourneys.observeSession), []);
  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }
    const end = () => searchProfileJourneys.end();
    window.addEventListener('pagehide', end);
    return () => window.removeEventListener('pagehide', end);
  }, []);

  useEffect(() => {
    if (status !== 'valid' || !accountId) {
      clearAnalytics();
      return;
    }

    identifyAnalytics(accountId);
  }, [accountId, status]);

  return null;
}
