import { OFREPWebProvider } from '@openfeature/ofrep-web-provider';
import { OpenFeature } from '@openfeature/web-sdk';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useSession } from '@/session/SessionProvider';
import type { Client } from '@openfeature/web-sdk';
import type { PropsWithChildren } from 'react';

const DOMAIN = 'kosmo';

export const FeatureFlagsContext = createContext<(key: string) => boolean>(() => false);

export function FeatureFlagsProvider({ children }: PropsWithChildren) {
  const { accountId } = useSession();
  const [evaluation, setEvaluation] = useState<{
    accountId: string;
    client: Client;
  } | null>(null);

  useEffect(() => {
    setEvaluation(null);

    if (accountId === null) {
      return;
    }

    let active = true;
    void OpenFeature.setProviderAndWait(
      DOMAIN,
      new OFREPWebProvider({
        baseUrl: 'https://flags.kos.moe',
        cacheMode: 'disabled',
        changeDetection: 'none',
        disableVisibilityRefresh: true,
      }),
      { targetingKey: accountId },
    )
      .then(() => {
        if (active) {
          setEvaluation({ accountId, client: OpenFeature.getClient(DOMAIN) });
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [accountId]);

  const isEnabled = useCallback(
    (key: string) =>
      evaluation?.accountId === accountId && evaluation.client.getBooleanValue(key, false),
    [accountId, evaluation],
  );

  return <FeatureFlagsContext.Provider value={isEnabled}>{children}</FeatureFlagsContext.Provider>;
}

export function useFeatureFlag(key: string) {
  return useContext(FeatureFlagsContext)(key);
}
