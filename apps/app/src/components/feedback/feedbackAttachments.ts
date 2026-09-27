import { getApiOrigin, getPublicWebOrigin } from '@/config/origin';
import type { FeedbackKind } from '@kosmo/core/enums';
import type { ImagePickerAsset } from 'expo-image-picker';

type FeedbackAsset = Pick<ImagePickerAsset, 'file' | 'fileName' | 'uri'> & {
  mimeType?: string | null;
};
type NativeFeedbackAttachment = {
  readonly name: string;
  readonly type: string;
  readonly uri: string;
};
type FeedbackAttachmentItem = { readonly asset: FeedbackAsset };

export function getFeedbackAssetContentType(asset: FeedbackAsset): string | null {
  const contentType = (asset.mimeType || asset.file?.type || '').toLowerCase();
  if (contentType) {
    return ['image/jpeg', 'image/png', 'image/webp'].includes(contentType) ? contentType : null;
  }
  const extension = (asset.fileName || asset.file?.name || asset.uri.split(/[?#]/u)[0])
    .split('.')
    .pop()
    ?.toLowerCase();
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return null;
  }
}

function createFeedbackAttachment(
  asset: FeedbackAsset,
  contentType: string,
  index: number,
): Blob | NativeFeedbackAttachment {
  const extension =
    contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/webp' ? 'webp' : 'png';
  const file = asset.file;
  if (!file) {
    return {
      name: `feedback-${index + 1}.${extension}`,
      type: contentType,
      uri: asset.uri,
    };
  }

  if (file.type.toLowerCase() === contentType) {
    return file;
  }

  return new File([file], file.name || `feedback-${index + 1}.${extension}`, {
    lastModified: file.lastModified,
    type: contentType,
  });
}

export function createFeedbackAttachmentFormData({
  body,
  items,
  kind,
}: {
  body: string;
  items: readonly FeedbackAttachmentItem[];
  kind: FeedbackKind;
}): FormData {
  const formData = new FormData();
  formData.append('body', body);
  formData.append('kind', kind);

  items.forEach(({ asset }, index) => {
    const contentType = getFeedbackAssetContentType(asset);
    if (!contentType) {
      throw new Error('Unsupported feedback image');
    }
    const attachment = createFeedbackAttachment(asset, contentType, index);
    formData.append('attachments', attachment as unknown as Blob);
  });

  return formData;
}

export async function submitFeedbackWithAttachments({
  body,
  items,
  kind,
  native,
  nativeToken,
}: {
  body: string;
  items: readonly FeedbackAttachmentItem[];
  kind: FeedbackKind;
  native: boolean;
  nativeToken: string | null;
}): Promise<void> {
  const response = await fetch(
    `${native ? getApiOrigin() : getPublicWebOrigin()}/feedback/attachments`,
    {
      body: createFeedbackAttachmentFormData({ body, items, kind }),
      credentials: native ? 'omit' : 'include',
      headers: {
        accept: 'application/json',
        ...(native && nativeToken ? { authorization: `Bearer ${nativeToken}` } : {}),
      },
      method: 'POST',
    },
  );

  if (!response.ok) {
    throw new Error(`Feedback request failed with HTTP ${response.status}.`);
  }

  const result = (await response.json().catch(() => null)) as { completed?: unknown } | null;
  if (!result || result.completed !== true) {
    throw new Error('Invalid feedback response.');
  }
}
