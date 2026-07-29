import { useEffect } from 'react';
import { useSession } from '@/session/SessionProvider';
import {
  clearAnalytics,
  consumeWebLoginStarted,
  identifyAnalytics,
  trackAnalytics,
} from './client';

export function AnalyticsSessionBridge(): null {
  const { accountId, status } = useSession();

  useEffect(() => {
    if (status === 'guest') {
      clearAnalytics();
      return;
    }

    if (status !== 'valid' || !accountId) {
      return;
    }

    identifyAnalytics(accountId);
    if (consumeWebLoginStarted()) {
      trackAnalytics('login_succeeded');
    }
  }, [accountId, status]);

  return null;
}
