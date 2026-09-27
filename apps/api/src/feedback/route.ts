import { db } from '@kosmo/core/db';
import { FeedbackKind } from '@kosmo/core/enums';
import { ConflictError, ValidationError } from '@kosmo/core/error';
import {
  feedbackBodySchema,
  feedbackMultipartMaxBytes,
  readRequestBodyWithinLimit,
} from '@kosmo/core/validation';
import { Hono } from 'hono';
import { readFeedbackAttachments } from './attachments';
import { deliverFeedback, FeedbackDeliveryError } from './delivery';
import { resolveFeedbackIdentity } from './identity';
import type { FeedbackKind as FeedbackKindValue } from '@kosmo/core/enums';
import type { Env } from '@/context';

export const feedback = new Hono<Env>();

feedback.post('/attachments', async (c) => {
  const session = c.get('context').session;
  if (!session) {
    return c.json({ message: '인증이 필요해요.' }, 401);
  }

  if (!c.req.header('content-type')?.toLowerCase().startsWith('multipart/form-data')) {
    return c.json({ message: 'multipart/form-data 요청이 필요해요.' }, 400);
  }

  const body = await readRequestBodyWithinLimit(c.req.raw, feedbackMultipartMaxBytes);
  if (body === null) {
    return c.json({ message: '요청 본문이 너무 커요.' }, 413);
  }

  try {
    let formData: FormData;
    try {
      formData = await new Request(c.req.raw, {
        body,
        duplex: 'half',
      } as RequestInit & { duplex: 'half' }).formData();
    } catch {
      throw new ValidationError('multipart 요청 형식을 확인해주세요.');
    }
    const input = await parseFeedbackForm(formData);
    const identity = await resolveFeedbackIdentity(
      session.accountId,
      session.profile?.id ?? null,
      db,
    );
    const result = await deliverFeedback(identity, input);
    return c.json(result, 200);
  } catch (error) {
    if (error instanceof FeedbackDeliveryError) {
      return c.json({ message: error.message }, 503);
    }
    if (error instanceof ConflictError) {
      return c.json({ message: error.message }, 409);
    }
    if (error instanceof ValidationError) {
      return c.json({ message: error.message }, 400);
    }
    throw error;
  }
});

const parseFeedbackForm = async (formData: FormData) => {
  for (const key of formData.keys()) {
    if (key !== 'body' && key !== 'kind' && key !== 'attachments') {
      throw new ValidationError('지원하지 않는 피드백 필드예요.');
    }
  }

  const body = formData.getAll('body');
  const kind = formData.getAll('kind');
  const files = formData.getAll('attachments');
  if (body.length !== 1 || typeof body[0] !== 'string') {
    throw new ValidationError('피드백 내용을 확인해주세요.');
  }
  if (kind.length !== 1 || typeof kind[0] !== 'string' || !isFeedbackKind(kind[0])) {
    throw new ValidationError('피드백 종류를 확인해주세요.');
  }
  const parsedBody = feedbackBodySchema.safeParse(body[0]);
  if (!parsedBody.success) {
    throw new ValidationError(parsedBody.error.issues[0]?.message, { field: 'body' });
  }
  if (files.length < 1) {
    throw new ValidationError('이미지를 한 장 이상 첨부해주세요.', { field: 'attachments' });
  }

  return {
    body: parsedBody.data,
    kind: kind[0],
    attachments: await readFeedbackAttachments(files),
  } satisfies {
    body: string;
    kind: FeedbackKindValue;
    attachments: Awaited<ReturnType<typeof readFeedbackAttachments>>;
  };
};

const isFeedbackKind = (value: string): value is FeedbackKindValue =>
  Object.hasOwn(FeedbackKind, value);
