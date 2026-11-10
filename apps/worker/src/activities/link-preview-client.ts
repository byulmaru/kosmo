import { normalizeLinkPreviewUrl } from '@kosmo/core/link-preview';
import { z } from 'zod';
import type { LinkPreview } from '@kosmo/core/link-preview';

const endpoint = 'https://embed.byulmaru.co/api/metadata';
const requestTimeoutMs = 6_000;
const maxResponseBytes = 512 * 1024;
const titleMaxLength = 300;
const descriptionMaxLength = 1_000;

const metadataSchema = z.object({
  url: z.string(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
});

function limitedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength).trimEnd() || null;
}

async function readResponseBody(
  response: Response,
  controller: AbortController,
): Promise<Uint8Array | null> {
  const reader = response.body?.getReader();
  if (reader === undefined) {
    return null;
  }

  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      size += value.byteLength;
      if (size > maxResponseBytes) {
        controller.abort();
        void reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, size);
}

export async function fetchLinkPreview(value: string): Promise<LinkPreview | null> {
  const url = normalizeLinkPreviewUrl(value);
  const key = process.env.EMBED_API_KEY?.trim();
  if (url === null || !key) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const requestUrl = new URL(endpoint);
  requestUrl.searchParams.set('url', url);

  try {
    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${key}`,
      },
      redirect: 'error',
      signal: controller.signal,
    });

    const contentType = response.headers
      .get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase();
    if (!response.ok || (contentType !== 'application/json' && !contentType?.endsWith('+json'))) {
      controller.abort();
      void response.body?.cancel().catch(() => undefined);
      return null;
    }

    const body = await readResponseBody(response, controller);
    if (body === null) {
      return null;
    }

    const metadata = metadataSchema.safeParse(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)),
    );
    if (!metadata.success) {
      return null;
    }

    const title = limitedText(metadata.data.title, titleMaxLength);
    if (title === null) {
      return null;
    }

    return {
      url,
      title,
      description: limitedText(metadata.data.description, descriptionMaxLength),
      imageUrl:
        typeof metadata.data.image === 'string'
          ? normalizeLinkPreviewUrl(metadata.data.image.trim())
          : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
