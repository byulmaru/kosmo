import { z } from 'zod';

export type ImageUploadStage = 'issue' | 'transfer' | 'complete';

export type ImageUploadOperation = 'issue' | 'normalize' | 'read' | 'put' | 'complete';

const imageUploadCodeSchema = z.enum([
  'unsupported_image',
  'content_type_mismatch',
  'size_limit_exceeded',
  'pixel_limit_exceeded',
  'dimension_limit_exceeded',
  'invalid_image',
]);

export type ImageUploadCode = z.infer<typeof imageUploadCodeSchema>;

export type ImageUploadObservation = {
  readonly code?: ImageUploadCode;
  readonly operation: ImageUploadOperation;
  readonly status?: number;
};

export type ImageUploadReason =
  | 'unsupported-format'
  | 'file-too-large'
  | 'image-too-large'
  | 'invalid-image'
  | 'transient';

export type ImageUploadFailure = {
  readonly reason: ImageUploadReason;
  readonly stage: ImageUploadStage;
};

export class ImageUploadError extends Error {
  readonly failure: ImageUploadFailure;
  readonly observation?: ImageUploadObservation;

  constructor(
    failure: ImageUploadFailure,
    observation?: ImageUploadObservation,
    options?: ErrorOptions,
  ) {
    super('Image upload failed', options);
    this.name = 'ImageUploadError';
    this.failure = failure;
    this.observation = observation;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getTransferReason(status: number, code: ImageUploadCode | undefined): ImageUploadReason {
  if (status === 415 && (code === 'unsupported_image' || code === 'content_type_mismatch')) {
    return 'unsupported-format';
  }
  if (status === 413 && code === 'size_limit_exceeded') {
    return 'file-too-large';
  }
  if (status === 422 && (code === 'pixel_limit_exceeded' || code === 'dimension_limit_exceeded')) {
    return 'image-too-large';
  }
  if (status === 422 && code === 'invalid_image') {
    return 'invalid-image';
  }
  return 'transient';
}

export async function assertImageUploadResponse(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }

  let code: ImageUploadCode | undefined;
  try {
    const body: unknown = await response.json();
    const error = isRecord(body) ? body.error : undefined;
    const candidate = isRecord(error) ? error.code : undefined;
    const parsedCode = imageUploadCodeSchema.safeParse(candidate);
    code = parsedCode.success ? parsedCode.data : undefined;
  } catch {
    // A malformed or empty response is a transient transfer failure.
  }

  throw new ImageUploadError(
    {
      reason: getTransferReason(response.status, code),
      stage: 'transfer',
    },
    {
      ...(code ? { code } : {}),
      operation: 'put',
      ...(Number.isFinite(response.status) ? { status: response.status } : {}),
    },
  );
}

export function asImageUploadError(
  error: unknown,
  stage: ImageUploadStage,
  operation?: ImageUploadOperation,
): ImageUploadError {
  if (error instanceof ImageUploadError) {
    return error;
  }

  return new ImageUploadError(
    { reason: 'transient', stage },
    operation ? { operation } : undefined,
    { cause: error },
  );
}

export function formatImageUploadFailureMessage(
  subject: string,
  failure: ImageUploadFailure,
): string {
  switch (failure.reason) {
    case 'unsupported-format':
      return `${subject}는 지원하지 않는 이미지 형식이에요.`;
    case 'file-too-large':
      return `${subject} 파일이 너무 커요. 16 MiB 이하의 이미지를 선택해 주세요.`;
    case 'image-too-large':
      return `${subject} 해상도가 너무 커요. 더 작은 이미지를 선택해 주세요.`;
    case 'invalid-image':
      return `${subject} 파일을 읽을 수 없어요. 다른 이미지를 선택해 주세요.`;
    case 'transient':
      switch (failure.stage) {
        case 'issue':
          return `${subject} 업로드를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.`;
        case 'transfer':
          return `${subject}를 업로드하지 못했어요. 잠시 후 다시 시도해 주세요.`;
        case 'complete':
          return `${subject} 업로드를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.`;
      }
  }
}

export function formatImageUploadRetryLabel(subject: string): string {
  return `${subject} 업로드 다시 시도`;
}
