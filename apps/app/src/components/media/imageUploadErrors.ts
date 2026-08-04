export type ImageUploadStage = 'issue' | 'transfer' | 'complete';

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

  constructor(failure: ImageUploadFailure) {
    super('Image upload failed');
    this.name = 'ImageUploadError';
    this.failure = failure;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getTransferReason(status: number, code: unknown): ImageUploadReason {
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

  let code: unknown;
  try {
    const body: unknown = await response.json();
    const error = isRecord(body) ? body.error : undefined;
    code = isRecord(error) ? error.code : undefined;
  } catch {
    // A malformed or empty response is a transient transfer failure.
  }

  throw new ImageUploadError({
    reason: getTransferReason(response.status, code),
    stage: 'transfer',
  });
}

export function asImageUploadError(error: unknown, stage: ImageUploadStage): ImageUploadError {
  if (error instanceof ImageUploadError) {
    return error;
  }

  return new ImageUploadError({ reason: 'transient', stage });
}

export function getImageUploadFailure(
  error: unknown,
  fallbackStage: ImageUploadStage = 'transfer',
): ImageUploadFailure {
  return asImageUploadError(error, fallbackStage).failure;
}

export function formatImageUploadFailureMessage(
  subject: string,
  failure: ImageUploadFailure,
): string {
  switch (failure.reason) {
    case 'unsupported-format':
      return `${subject}는 JPEG, PNG 또는 WebP 형식만 업로드할 수 있어요.`;
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
