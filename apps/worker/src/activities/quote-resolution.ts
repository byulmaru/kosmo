import '@kosmo/core/polyfill';

import { federation, resolveStoredInboundQuote } from '@kosmo/fedify';
import type { InboundQuoteRetryInput } from '@kosmo/fedify';

export const resolveActivityPubQuoteActivity = async (input: InboundQuoteRetryInput) => {
  const origin = process.env.PUBLIC_ORIGIN?.trim() || 'http://127.0.0.1:4173';
  const result = await resolveStoredInboundQuote({
    context: federation.createContext(new URL(origin), undefined),
    ...input,
    receivedAt: Temporal.Now.instant(),
  });

  return result;
};
