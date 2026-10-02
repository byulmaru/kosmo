import { z } from 'zod';

export const feedbackBodyMaxLength = 2_000;

export const feedbackAttachmentLimit = 3;
export const feedbackAttachmentMaxBytes = 5_000_000;
export const feedbackAttachmentsMaxBytes = 15_000_000;

export type FeedbackAttachmentContentType = 'image/jpeg' | 'image/png' | 'image/webp';

export const isFeedbackAttachmentContentType = (
  value: string,
): value is FeedbackAttachmentContentType =>
  value === 'image/jpeg' || value === 'image/png' || value === 'image/webp';

export const matchesFeedbackAttachmentSignature = (
  contentType: FeedbackAttachmentContentType,
  bytes: Uint8Array,
): boolean => {
  if (contentType === 'image/jpeg') {
    return (
      bytes.length >= 4 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff &&
      bytes[bytes.length - 2] === 0xff &&
      bytes[bytes.length - 1] === 0xd9
    );
  }
  if (contentType === 'image/png') {
    if (
      ![0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
        (byte, index) => bytes[index] === byte,
      )
    ) {
      return false;
    }
    let hasHeader = false;
    for (let offset = 8; offset + 12 <= bytes.length; ) {
      const chunkLength = readUint32BE(bytes, offset);
      const chunkType = String.fromCharCode(
        bytes[offset + 4]!,
        bytes[offset + 5]!,
        bytes[offset + 6]!,
        bytes[offset + 7]!,
      );
      if (!hasHeader && chunkType !== 'IHDR') {
        return false;
      }
      if (offset + 12 + chunkLength > bytes.length) {
        return false;
      }
      if (chunkType === 'IHDR' && chunkLength !== 13) {
        return false;
      }
      if (chunkType === 'acTL') {
        return false;
      }
      hasHeader ||= chunkType === 'IHDR';
      if (chunkType === 'IEND') {
        return hasHeader && chunkLength === 0;
      }
      offset += 12 + chunkLength;
    }
    return false;
  }
  if (
    !(
      bytes.length >= 30 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    )
  ) {
    return false;
  }
  if (readUint32LE(bytes, 4) + 8 !== bytes.length) {
    return false;
  }
  let hasImageChunk = false;
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const chunkLength = readUint32LE(bytes, offset + 4);
    const paddedChunkLength = 8 + chunkLength + (chunkLength % 2);
    if (offset + paddedChunkLength > bytes.length) {
      return false;
    }
    const chunkType = String.fromCharCode(
      bytes[offset]!,
      bytes[offset + 1]!,
      bytes[offset + 2]!,
      bytes[offset + 3]!,
    );
    if (chunkType === 'VP8X') {
      if (chunkLength < 10 || (bytes[offset + 8]! & 0x02) !== 0) {
        return false;
      }
    } else if (chunkType === 'ANIM' || chunkType === 'ANMF') {
      return false;
    } else if (chunkType === 'VP8 ' || chunkType === 'VP8L') {
      hasImageChunk = true;
    }
    offset += paddedChunkLength;
  }
  return hasImageChunk;
};

const readUint32BE = (bytes: Uint8Array, offset: number): number =>
  bytes[offset]! * 0x1000000 +
  bytes[offset + 1]! * 0x10000 +
  bytes[offset + 2]! * 0x100 +
  bytes[offset + 3]!;

const readUint32LE = (bytes: Uint8Array, offset: number): number =>
  bytes[offset]! +
  bytes[offset + 1]! * 0x100 +
  bytes[offset + 2]! * 0x10000 +
  bytes[offset + 3]! * 0x1000000;

export const feedbackBodySchema = z
  .string()
  .trim()
  .min(1, '피드백 내용을 입력해주세요.')
  .max(feedbackBodyMaxLength, '피드백은 2,000자 이내로 입력해주세요.');
