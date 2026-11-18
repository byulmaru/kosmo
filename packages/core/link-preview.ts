import { createHash } from 'node:crypto';

export interface LinkPreview {
  readonly url: string;
  readonly title: string;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly imageWidth: number | null;
  readonly imageHeight: number | null;
}

export function normalizeLinkPreviewUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username !== '' ||
      url.password !== '' ||
      url.port !== ''
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export const getLinkPreviewUrlHash = (url: string): string =>
  createHash('sha256').update(url).digest('hex');
