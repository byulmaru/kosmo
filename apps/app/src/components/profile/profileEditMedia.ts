import { releaseImagePreview } from '@/components/media/imageUpload';
import type { ImagePickerAsset } from 'expo-image-picker';
import type { ImageUploadFailure } from '@/components/media/imageUploadErrors';
import type { ProfileEditImageDraft } from './profileEditState';

export type ProfileEditRouteImage = {
  readonly asset: ImagePickerAsset | null;
  readonly generation: number;
  readonly mediaId: string | null;
  readonly presentation: ProfileEditImageDraft;
};

export function createProfileEditRouteImage(
  media?: { readonly id: string; readonly url?: string | null } | null,
): ProfileEditRouteImage {
  return {
    asset: null,
    generation: 0,
    mediaId: media?.id ?? null,
    presentation: { kind: 'current', previewUri: media?.url ?? null },
  };
}

export function replaceProfileEditImage(
  current: ProfileEditRouteImage,
  asset: ImagePickerAsset,
): ProfileEditRouteImage {
  return {
    asset,
    generation: current.generation + 1,
    mediaId: null,
    presentation: {
      kind: 'replacement',
      previewUri: asset.uri,
      uploadState: 'uploading',
    },
  };
}

export function removeProfileEditImage(current: ProfileEditRouteImage): ProfileEditRouteImage {
  return {
    asset: null,
    generation: current.generation + 1,
    mediaId: null,
    presentation: { kind: 'removed', previewUri: null },
  };
}

export function completeProfileEditImageUpload(
  current: ProfileEditRouteImage,
  generation: number,
  mediaId: string,
): ProfileEditRouteImage {
  if (
    current.generation !== generation ||
    current.presentation.kind !== 'replacement' ||
    !current.asset
  ) {
    return current;
  }

  return {
    ...current,
    mediaId,
    presentation: {
      kind: 'replacement',
      previewUri: current.presentation.previewUri,
      uploadState: 'ready',
    },
  };
}

export function failProfileEditImageUpload(
  current: ProfileEditRouteImage,
  generation: number,
  failure: ImageUploadFailure,
): ProfileEditRouteImage {
  if (current.generation !== generation || current.presentation.kind !== 'replacement') {
    return current;
  }

  return {
    ...current,
    mediaId: null,
    presentation: { ...current.presentation, failure, uploadState: 'error' },
  };
}

export function retryProfileEditImageUpload(current: ProfileEditRouteImage): ProfileEditRouteImage {
  if (current.presentation.kind !== 'replacement' || !current.asset) {
    return current;
  }

  return {
    ...current,
    generation: current.generation + 1,
    mediaId: null,
    presentation: {
      kind: 'replacement',
      previewUri: current.presentation.previewUri,
      uploadState: 'uploading',
    },
  };
}

export function profileEditImageInput(image: ProfileEditRouteImage): string | null | undefined {
  if (image.presentation.kind === 'current') {
    return undefined;
  }
  if (image.presentation.kind === 'removed') {
    return null;
  }
  return image.mediaId ?? undefined;
}

export function releaseProfileEditImagePreview(
  image: ProfileEditRouteImage,
  revokeObjectUrl?: (url: string) => void,
) {
  if (image.presentation.kind === 'replacement' && image.asset) {
    releaseImagePreview(image.asset.uri, revokeObjectUrl);
  }
}
