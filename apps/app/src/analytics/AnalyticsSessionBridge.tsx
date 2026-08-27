import { useEffect } from 'react';
import { useSession } from '@/session/SessionProvider';
import { clearAnalytics, identifyAnalytics } from './client';

const IDENTITY_RETRY_DELAY_MS = 1_000;

export function AnalyticsSessionBridge(): null {
  const { accountId, status } = useSession();

  useEffect(() => {
    let retryId: ReturnType<typeof setTimeout> | undefined;

    const synchronizeIdentity = () => {
      retryId = undefined;
      const synchronized =
        status !== 'valid' || !accountId ? clearAnalytics() : identifyAnalytics(accountId);

      if (!synchronized) {
        retryId = setTimeout(synchronizeIdentity, IDENTITY_RETRY_DELAY_MS);
      }
    };

    synchronizeIdentity();
    return () => {
      if (retryId !== undefined) {
        clearTimeout(retryId);
      }
    };
  }, [accountId, status]);

  return null;
}
