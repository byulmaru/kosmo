import { createContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';

export const QuoteEnabledContext = createContext(false);

export function QuoteEnabledProvider({ children }: PropsWithChildren) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    void fetch('https://flags.kos.moe/ofrep/v1/evaluate/flags/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: { targetingKey: 'kosmo' } }),
    })
      .then(async (response) => {
        if (!response.ok) {
          return false;
        }

        const result: unknown = await response.json();
        return (
          typeof result === 'object' &&
          result !== null &&
          'value' in result &&
          result.value === true
        );
      })
      .then(setEnabled)
      .catch(() => setEnabled(false));
  }, []);

  return <QuoteEnabledContext.Provider value={enabled}>{children}</QuoteEnabledContext.Provider>;
}
