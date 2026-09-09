import { z } from 'zod';
import { captureHandledError } from '@/observability/sentry';
import {
  asImageUploadError,
  assertImageUploadResponse,
  ImageUploadError,
} from './imageUploadErrors';
import type { ImageManipulatorContext, ImageRef } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';
import type {
  ImageUploadFailure,
  ImageUploadOperation,
  ImageUploadStage,
} from './imageUploadErrors';

type IssuedImageUpload = {
  readonly mediaId: string;
  readonly uploadUrl: string;
};

const imageUploadMaxDimension = 2048;
const imageUploadWebpQuality = 0.8;
const imageDimensionsSchema = z.object({
  height: z.number().finite().positive(),
  width: z.number().finite().positive(),
});

function getImageResizeDimensions(
  image: Pick<ImageRef, 'height' | 'width'>,
): { readonly height: number; readonly width: number } | null {
  const longestDimension = Math.max(image.width, image.height);
  if (longestDimension <= imageUploadMaxDimension) {
    return null;
  }

  const scale = imageUploadMaxDimension / longestDimension;
  return {
    height: Math.max(1, Math.min(imageUploadMaxDimension, Math.round(image.height * scale))),
    width: Math.max(1, Math.min(imageUploadMaxDimension, Math.round(image.width * scale))),
  };
}

async function createNormalizedImageBody(asset: ImagePickerAsset): Promise<ArrayBuffer> {
  let context: ImageManipulatorContext | undefined;
  let sourceImage: ImageRef | undefined;
  let normalizedImage: ImageRef | undefined;
  let normalizedImageUri: string | undefined;

  try {
    const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
    context = ImageManipulator.manipulate(asset.uri);
    const assetDimensions = imageDimensionsSchema.safeParse(asset);
    const resizeDimensions = assetDimensions.success
      ? getImageResizeDimensions(assetDimensions.data)
      : undefined;
    if (resizeDimensions) {
      context.resize(resizeDimensions);
    }

    if (resizeDimensions !== undefined) {
      normalizedImage = await context.renderAsync();
    } else {
      sourceImage = await context.renderAsync();
      const decodedDimensions = imageDimensionsSchema.parse(sourceImage);
      const decodedResizeDimensions = getImageResizeDimensions(decodedDimensions);
      if (decodedResizeDimensions) {
        context.resize(decodedResizeDimensions);
        normalizedImage = await context.renderAsync();
      } else {
        normalizedImage = sourceImage;
      }
    }

    if (!normalizedImage) {
      throw new Error('Unable to render normalized image');
    }

    const result = await normalizedImage.saveAsync({
      compress: imageUploadWebpQuality,
      format: SaveFormat.WEBP,
    });
    normalizedImageUri = result.uri;

    let response: Response;
    try {
      response = await fetch(normalizedImageUri);
    } catch (error) {
      throw new ImageUploadError(
        { reason: 'transient', stage: 'transfer' },
        { operation: 'read' },
        { cause: error },
      );
    }
    if (!response.ok) {
      throw new ImageUploadError(
        { reason: 'transient', stage: 'transfer' },
        {
          operation: 'read',
          ...(Number.isFinite(response.status) ? { status: response.status } : {}),
        },
      );
    }
    try {
      return await response.arrayBuffer();
    } catch (error) {
      throw new ImageUploadError(
        { reason: 'transient', stage: 'transfer' },
        {
          operation: 'read',
          ...(Number.isFinite(response.status) ? { status: response.status } : {}),
        },
        { cause: error },
      );
    }
  } catch (error) {
    if (error instanceof ImageUploadError) {
      throw error;
    }
    throw new ImageUploadError(
      { reason: 'transient', stage: 'transfer' },
      { operation: 'normalize' },
      { cause: error },
    );
  } finally {
    for (const imageUri of new Set([
      normalizedImageUri,
      ...[sourceImage, normalizedImage].map((image) =>
        image && 'uri' in image && typeof image.uri === 'string' ? image.uri : undefined,
      ),
    ])) {
      if (imageUri) {
        releaseImagePreview(imageUri);
      }
    }
    if (normalizedImage && normalizedImage !== sourceImage) {
      normalizedImage.release();
    }
    sourceImage?.release();
    context?.release();
  }
}

export function releaseImagePreview(
  uri: string,
  revokeObjectUrl: (url: string) => void = URL.revokeObjectURL,
): void {
  if (uri.startsWith('blob:')) {
    revokeObjectUrl(uri);
  }
}

export async function uploadImage({
  asset,
  complete,
  isActive,
  issue,
}: {
  readonly asset: ImagePickerAsset;
  readonly complete: (mediaId: string) => Promise<void>;
  readonly isActive: () => boolean;
  readonly issue: () => Promise<IssuedImageUpload>;
}): Promise<string | null> {
  if (!isActive()) {
    return null;
  }

  let operation: ImageUploadOperation = 'issue';
  let issued: IssuedImageUpload;
  try {
    if (
      asset.file &&
      ([asset.mimeType, asset.file.type].some((mimeType) =>
        ['image/heic', 'image/heif'].includes(mimeType?.toLowerCase() ?? ''),
      ) ||
        /\.(heic|heif)$/i.test(asset.file.name))
    ) {
      operation = 'normalize';
      throw new ImageUploadError(
        { reason: 'unsupported-format', stage: 'transfer' },
        { operation },
      );
    }

    issued = await issue();
    operation = 'normalize';
    if (!isActive()) {
      return null;
    }

    const body = await createNormalizedImageBody(asset);
    operation = 'put';
    const response = await fetch(issued.uploadUrl, {
      body,
      headers: { 'content-type': 'image/webp' },
      method: 'PUT',
    });
    await assertImageUploadResponse(response);

    if (!isActive()) {
      return null;
    }

    operation = 'complete';
    await complete(issued.mediaId);
  } catch (error) {
    const stage: ImageUploadStage =
      operation === 'issue' ? 'issue' : operation === 'complete' ? 'complete' : 'transfer';
    const uploadError = asImageUploadError(error, stage, operation);
    try {
      if (isActive()) {
        const failure: ImageUploadFailure = uploadError.failure;
        const observation = uploadError.observation;
        const context: Record<string, string | number> = {
          operation: observation?.operation ?? operation,
          reason: failure.reason,
          stage: failure.stage,
        };
        if (typeof observation?.status === 'number' && Number.isFinite(observation.status)) {
          context.status = observation.status;
        }
        if (observation?.code) {
          context.code = observation.code;
        }
        captureHandledError(uploadError, context);
      }
    } catch {
      // Observability must not change the upload result.
    }
    throw uploadError;
  }
  return isActive() ? issued.mediaId : null;
}
