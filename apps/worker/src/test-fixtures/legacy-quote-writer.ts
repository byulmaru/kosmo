import { proxyActivities } from '@temporalio/workflow';
import type { ApplyPostQuoteConsentInput } from './legacy-quote-consent-961';

// Executes the immutable #961 writer while testing a live owner rollout.
export async function legacyQuoteWriter(input: ApplyPostQuoteConsentInput): Promise<void> {
  const { writeLegacyQuote } = proxyActivities<{
    writeLegacyQuote(input: ApplyPostQuoteConsentInput): Promise<void>;
  }>({ startToCloseTimeout: '90 seconds', retry: { maximumAttempts: 1 } });
  await writeLegacyQuote(input);
}
