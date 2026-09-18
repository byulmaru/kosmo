import '@kosmo/core/polyfill';

import { federation, resolveStoredInboundQuote } from '@kosmo/fedify';

export type ActivityPubQuoteResolutionInput = {
  readonly postId: string;
  readonly revision: number;
};

export const resolveActivityPubQuoteActivity = async ({
  postId,
  revision,
}: ActivityPubQuoteResolutionInput): Promise<void> => {
  const origin = process.env.PUBLIC_ORIGIN?.trim() || 'http://127.0.0.1:4173';
  const result = await resolveStoredInboundQuote({
    context: federation.createContext(new URL(origin), undefined),
    postId,
    receivedAt: Temporal.Now.instant(),
    revision,
  });

  if (result.retryable && result.status === 'PENDING') {
    throw new Error(`ActivityPub Quote resolution remains pending for ${postId}:${revision}`);
  }
};
