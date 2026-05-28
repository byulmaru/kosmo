import { z } from 'zod';

export const jobEnvelopeSchema = z.object({
  enqueuedAt: z.string().datetime({ offset: true }),
  id: z.string().min(1),
  payload: z.unknown(),
  traceId: z.string().min(1).optional(),
  type: z.string().min(1),
  version: z.number().int().positive(),
});

export type JobEnvelope = z.infer<typeof jobEnvelopeSchema>;

export type JobDefinition<TPayload> = {
  payloadSchema: z.ZodType<TPayload>;
  subject: string;
  type: string;
  version: number;
};

export type JobHandlerContext = {
  deliveryCount: number;
  enqueuedAt: string;
  jobId: string;
  jobType: string;
  redelivered: boolean;
  subject: string;
};

export type JobHandler<TPayload> = (
  payload: TPayload,
  context: JobHandlerContext,
) => Promise<void> | void;

export type PublishJobInput<TPayload> = {
  id?: string;
  payload: TPayload;
  traceId?: string;
};

export type PublishJobResult = {
  duplicate: boolean;
  jobId: string;
  seq: number;
  stream: string;
};

export type QueueLogger = Pick<Console, 'error' | 'info' | 'warn'>;
