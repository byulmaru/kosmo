import { ApplicationFailure, proxyActivities } from '@temporalio/workflow';
import { z } from 'zod';
import type { LinkPreview } from '@kosmo/core/link-preview';
import type { LinkPreviewRefreshInput } from '@kosmo/core/temporal/link-preview';
import type * as activities from '../activities';

const httpUrlSchema = z
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname !== '' &&
      url.username === '' &&
      url.password === '' &&
      url.port === ''
    );
  })
  .transform((value) => new URL(value).href);

const inputSchema = z.object({ url: httpUrlSchema }) satisfies z.ZodType<LinkPreviewRefreshInput>;

const { refreshLinkPreviewActivity } = proxyActivities<typeof activities>({
  retry: { maximumAttempts: 1 },
  startToCloseTimeout: '8 seconds',
});

export async function linkPreviewRefreshWorkflow(
  input: LinkPreviewRefreshInput,
): Promise<LinkPreview | null> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable(
      parsed.error.issues[0]?.message ?? 'Link preview input is invalid',
      'VALIDATION',
    );
  }

  return refreshLinkPreviewActivity(parsed.data);
}
