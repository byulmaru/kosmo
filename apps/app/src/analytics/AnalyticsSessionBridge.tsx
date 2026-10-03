import { useEffect } from 'react';
import { useAnalyticsIdentityAccountId, useSession } from '@/session/SessionProvider';
import { clearAnalytics, identifyAnalytics, setAnalyticsSelectedProfile } from './client';

export function AnalyticsSessionBridge(): null {
  const accountId = useAnalyticsIdentityAccountId();
  const { accountId: visibleAccountId, selectedProfileId, status } = useSession();

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

  return null;
}
