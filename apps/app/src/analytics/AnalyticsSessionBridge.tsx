import { useEffect, useRef } from 'react';
import { useAnalyticsIdentityAccountId, useSession } from '@/session/SessionProvider';
import { clearAnalytics, identifyAnalytics, setAnalyticsSelectedProfile } from './client';
import { endProfileHashtagExplorationsForAccount } from './profileHashtagExploration';

export function AnalyticsSessionBridge(): null {
  const accountId = useAnalyticsIdentityAccountId();
  const { accountId: visibleAccountId, selectedProfileId, status } = useSession();
  const previousAccountIdRef = useRef<string | null>(null);

  useEffect(() => {
    const previousAccountId = previousAccountIdRef.current;
    if (previousAccountId && previousAccountId !== accountId) {
      endProfileHashtagExplorationsForAccount(previousAccountId);
    }
    previousAccountIdRef.current = accountId;
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
