import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useSession } from '@/session/SessionProvider';
import type { PropsWithChildren } from 'react';

export const FeatureFlagsContext = createContext<(key: string) => boolean>(() => false);

export function FeatureFlagsProvider({ children }: PropsWithChildren) {
  const { accountId } = useSession();
  const [evaluation, setEvaluation] = useState<{
    accountId: string;
    flags: Record<string, boolean>;
  } | null>(null);

  useEffect(() => {
    setEvaluation(null);

    if (accountId === null) {
      return;
    }

    let active = true;
    void fetch('https://flags.kos.moe/ofrep/v1/evaluate/flags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: { targetingKey: accountId } }),
    })
      .then(async (response) => {
        if (!response.ok) {
          return {};
        }

        const result: unknown = await response.json();
        if (
          typeof result !== 'object' ||
          result === null ||
          !('flags' in result) ||
          !Array.isArray(result.flags)
        ) {
          return {};
        }

        return Object.fromEntries(
          result.flags.flatMap((flag) => {
            if (
              typeof flag !== 'object' ||
              flag === null ||
              !('key' in flag) ||
              typeof flag.key !== 'string' ||
              !('value' in flag) ||
              typeof flag.value !== 'boolean' ||
              'errorCode' in flag
            ) {
              return [];
            }

            return [[flag.key, flag.value]];
          }),
        );
      })
      .then((flags) => {
        if (active) {
          setEvaluation({ accountId, flags });
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [accountId]);

  const isEnabled = useCallback(
    (key: string) => evaluation?.accountId === accountId && evaluation.flags[key] === true,
    [accountId, evaluation],
  );

  return <FeatureFlagsContext.Provider value={isEnabled}>{children}</FeatureFlagsContext.Provider>;
}

export function useFeatureFlag(key: string) {
  return useContext(FeatureFlagsContext)(key);
}
