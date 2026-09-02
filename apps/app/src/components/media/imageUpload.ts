import { z } from 'zod';
import { asImageUploadError, assertImageUploadResponse } from './imageUploadErrors';
import type { ImageRef } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';

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

async function createNormalizedImageBlob(asset: ImagePickerAsset): Promise<Blob> {
  const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
  const context = ImageManipulator.manipulate(asset.uri);
  let sourceImage: ImageRef | undefined;
  let normalizedImage: ImageRef | undefined;
  let normalizedImageUri: string | undefined;

  try {
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

    const response = await fetch(normalizedImageUri);
    if (!response.ok) {
      throw new Error('Unable to read normalized image');
    }
    return await response.blob();
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
    context.release();
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

  let issued: IssuedImageUpload;
  try {
    issued = await issue();
  } catch (error) {
    throw asImageUploadError(error, 'issue');
  }
  if (!isActive()) {
    return null;
  }

  try {
    const body = await createNormalizedImageBlob(asset);
    const response = await fetch(issued.uploadUrl, {
      body,
      headers: { 'content-type': 'image/webp' },
      method: 'PUT',
    });
    await assertImageUploadResponse(response);
  } catch (error) {
    throw asImageUploadError(error, 'transfer');
  }
  if (!isActive()) {
    return null;
  }

  try {
    await complete(issued.mediaId);
  } catch (error) {
    throw asImageUploadError(error, 'complete');
  }
  return isActive() ? issued.mediaId : null;
}
