import { useEffect } from 'react';
import { useSession } from '@/session/SessionProvider';
import { clearAnalytics, identifyAnalytics, setAnalyticsSelectedProfile } from './client';

export function AnalyticsSessionBridge(): null {
  const { accountId, selectedProfileId, status } = useSession();

  useEffect(() => {
    if (status !== 'valid' || !accountId) {
      setAnalyticsSelectedProfile(null, null);
      clearAnalytics();
      return;
    }

    setAnalyticsSelectedProfile(accountId, selectedProfileId);
    identifyAnalytics(accountId);
  }, [accountId, selectedProfileId, status]);

  return null;
}
