import { useEffect } from 'react';
import { useSession } from '@/session/SessionProvider';
import { clearAnalytics, identifyAnalytics } from './client';

export function AnalyticsSessionBridge(): null {
  const { accountId, status } = useSession();

  useEffect(() => {
    if (status !== 'valid' || !accountId) {
      clearAnalytics();
      return;
    }

    identifyAnalytics(accountId);
  }, [accountId, status]);

  return null;
}
