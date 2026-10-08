import { operationalNotificationWorkflow } from '@kosmo/core/temporal/operational-notification';
import {
  ApplicationFailure,
  continueAsNew,
  proxyActivities,
  workflowInfo,
} from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import type { OperationalNotificationWorkflowInput } from '@kosmo/core/temporal/operational-notification';
import type * as activities from '../activities';

const INTERNAL_ORIGIN = 'https://kosmo.invalid';

const operationalNotificationInputSchema = z.strictObject({
  sendId: z.uuid(),
  data: z.strictObject({
    title: z.string().trim().min(1),
    body: z.string().optional(),
    href: z.string().trim().min(1),
  }),
  continuation: z
    .strictObject({
      afterNotificationId: z.uuid(),
    })
    .optional(),
}) satisfies z.ZodType<OperationalNotificationWorkflowInput>;

const normalizeOperationalHref = (value: string): string => {
  if (
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
  ) {
    throw new TypeError('Operational notification href must not contain control characters');
  }

  if (value.startsWith('/')) {
    if (value.startsWith('//')) {
      throw new TypeError('Operational notification href must be root-relative');
    }

    const url = new URL(value, INTERNAL_ORIGIN);
    if (url.origin !== INTERNAL_ORIGIN) {
      throw new TypeError('Operational notification href must stay on the app origin');
    }
    if (url.pathname.startsWith('//')) {
      throw new TypeError('Operational notification href must be root-relative');
    }
    return `${url.pathname}${url.search}${url.hash}`;
  }

  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('Operational notification href must use HTTP(S) or be app-root-relative');
  }
  return url.href;
};

const {
  captureOperationalNotificationAudienceActivity,
  dispatchOperationalNotificationPageActivity,
} = proxyActivities<typeof activities>(workflowActivityOptions);

export async function operationalNotificationDeliveryWorkflow(input: unknown): Promise<void> {
  const parsed = operationalNotificationInputSchema.safeParse(input);
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable(
      parsed.error.issues[0]?.message ?? 'Operational notification input is invalid',
    );
  }

  const { continuation, data, sendId } = parsed.data;
  const info = workflowInfo();
  if (
    info.workflowId !== operationalNotificationWorkflow.workflowIdFromArgs({ sendId, data }) ||
    (info.continuedFromExecutionRunId !== undefined) !== (continuation !== undefined)
  ) {
    throw ApplicationFailure.nonRetryable('Operational notification workflow identity is invalid');
  }

  let normalizedHref: string;
  try {
    normalizedHref = normalizeOperationalHref(data.href);
  } catch (error) {
    throw ApplicationFailure.nonRetryable(
      error instanceof Error ? error.message : 'Operational notification href is invalid',
    );
  }

  const normalizedData = { ...data, href: normalizedHref };
  if (
    continuation === undefined &&
    !(await captureOperationalNotificationAudienceActivity({ sendId, data: normalizedData }))
  ) {
    return;
  }

  const page = await dispatchOperationalNotificationPageActivity({
    sendId,
    ...(continuation === undefined
      ? {}
      : { afterNotificationId: continuation.afterNotificationId }),
  });
  if (!page.hasMore || page.afterNotificationId === null) {
    return;
  }

  await continueAsNew<typeof operationalNotificationDeliveryWorkflow>({
    sendId,
    data: normalizedData,
    continuation: { afterNotificationId: page.afterNotificationId },
  });
}
