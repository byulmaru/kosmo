import { z } from 'zod';

export const feedbackBodyMaxLength = 2_000;

export const feedbackAttachmentLimit = 3;
export const feedbackAttachmentMaxBytes = 5_000_000;
export const feedbackAttachmentsMaxBytes = 15_000_000;
export const feedbackMultipartMaxBytes = 16_000_000;

export const readRequestBodyWithinLimit = async (
  request: Request,
  maxBytes: number,
): Promise<ArrayBuffer | null> => {
  const contentLength = request.headers.get('content-length');
  if (
    contentLength &&
    Number.isSafeInteger(Number(contentLength)) &&
    Number(contentLength) > maxBytes
  ) {
    return null;
  }
  if (!request.body) {
    return new ArrayBuffer(0);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      totalBytes += result.value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
};

export const feedbackBodySchema = z
  .string()
  .trim()
  .min(1, '피드백 내용을 입력해주세요.')
  .max(feedbackBodyMaxLength, '피드백은 2,000자 이내로 입력해주세요.');
