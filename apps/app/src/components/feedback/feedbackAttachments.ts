import type { ImagePickerAsset } from 'expo-image-picker';
import type { UploadableMap } from 'relay-runtime';

type FeedbackAsset = Pick<ImagePickerAsset, 'file' | 'fileName' | 'uri'> & {
  mimeType?: string | null;
};
type NativeUploadable = { readonly name: string; readonly type: string; readonly uri: string };

export function getFeedbackAssetContentType(asset: FeedbackAsset): string | null {
  const contentType = (asset.mimeType || asset.file?.type || '').toLowerCase();
  if (contentType) {
    return ['image/jpeg', 'image/png', 'image/webp'].includes(contentType) ? contentType : null;
  }
  const extension = (asset.fileName || asset.uri.split(/[?#]/u)[0]).split('.').pop()?.toLowerCase();
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

export function createFeedbackUploadables(
  items: readonly { asset: FeedbackAsset }[],
): UploadableMap {
  const uploadables = Object.fromEntries(
    items.map((item, index) => {
      const contentType = getFeedbackAssetContentType(item.asset);
      if (!contentType) {
        throw new Error('Unsupported feedback image');
      }
      const extension =
        contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/webp' ? 'webp' : 'png';
      const uploadable: Blob | NativeUploadable = item.asset.file ?? {
        name: `feedback-${index + 1}.${extension}`,
        type: contentType,
        uri: item.asset.uri,
      };
      return [`input.attachments.${index}`, uploadable];
    }),
  );
  return uploadables as unknown as UploadableMap;
}
