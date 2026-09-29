import {
  feedbackAttachmentLimit,
  feedbackAttachmentMaxBytes,
  feedbackAttachmentsMaxBytes,
  isFeedbackAttachmentContentType,
  matchesFeedbackAttachmentSignature,
} from '@kosmo/core/validation';
import type { ImagePickerAsset } from 'expo-image-picker';

type FeedbackAsset = Pick<ImagePickerAsset, 'file' | 'fileName' | 'uri'> & {
  fileSize?: number | null;
  mimeType?: string | null;
};
type FeedbackAttachmentItem = { readonly asset: FeedbackAsset };
export type FeedbackAttachment = {
  readonly contentType: string;
  readonly data: Uint8Array;
  readonly filename: string;
};

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

function getFeedbackAttachmentFilename(contentType: string, index: number) {
  const extension =
    contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/webp' ? 'webp' : 'png';
  return `feedback-${index + 1}.${extension}`;
}

async function readFeedbackAttachment(
  asset: FeedbackAsset,
  index: number,
): Promise<FeedbackAttachment> {
  const contentType = getFeedbackAssetContentType(asset);
  if (!contentType || !isFeedbackAttachmentContentType(contentType)) {
    throw new Error('정적 JPEG, PNG, WebP 이미지만 첨부할 수 있어요.');
  }

  let bytes: Uint8Array;
  if (asset.file) {
    bytes = new Uint8Array(await asset.file.arrayBuffer());
  } else {
    const response = await fetch(asset.uri);
    if (!response.ok) {
      throw new Error('이미지 파일을 읽을 수 없어요.');
    }
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  if (bytes.byteLength === 0) {
    throw new Error('이미지 파일을 읽을 수 없어요.');
  }
  if (!matchesFeedbackAttachmentSignature(contentType, bytes)) {
    throw new Error('이미지 파일 형식을 확인해주세요.');
  }
  return {
    contentType,
    data: bytes,
    filename: getFeedbackAttachmentFilename(contentType, index),
  };
}

export async function prepareFeedbackAttachments(
  items: readonly FeedbackAttachmentItem[],
): Promise<readonly FeedbackAttachment[]> {
  if (items.length > feedbackAttachmentLimit) {
    throw new Error('이미지는 최대 3장까지 첨부할 수 있어요.');
  }

  const attachments: FeedbackAttachment[] = [];
  let totalBytes = 0;
  for (const [index, { asset }] of items.entries()) {
    const contentType = getFeedbackAssetContentType(asset);
    if (!contentType || !isFeedbackAttachmentContentType(contentType)) {
      throw new Error('정적 JPEG, PNG, WebP 이미지만 첨부할 수 있어요.');
    }
    const knownBytes = asset.file?.size ?? asset.fileSize ?? null;
    if (knownBytes !== null && knownBytes > feedbackAttachmentMaxBytes) {
      throw new Error('이미지는 한 장당 5MB 이하로 첨부해주세요.');
    }
    const attachment = await readFeedbackAttachment(asset, index);
    if (attachment.data.byteLength > feedbackAttachmentMaxBytes) {
      throw new Error('이미지는 한 장당 5MB 이하로 첨부해주세요.');
    }
    totalBytes += attachment.data.byteLength;
    if (totalBytes > feedbackAttachmentsMaxBytes) {
      throw new Error('이미지는 합계 15MB 이하로 첨부해주세요.');
    }
    attachments.push(attachment);
  }

  return attachments;
}
