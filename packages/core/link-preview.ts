import { createHash } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns';
import * as http from 'node:http';
import * as https from 'node:https';
import ipaddr from 'ipaddr.js';
import { JSDOM } from 'jsdom';
import type { LookupAddress } from 'node:dns';
import type {
  IncomingHttpHeaders,
  IncomingMessage,
  RequestOptions as HttpRequestOptions,
} from 'node:http';
import type { RequestOptions as HttpsRequestOptions } from 'node:https';

const requestTimeoutMs = 3_000;
const maxHtmlBytes = 512 * 1024;
const maxRedirects = 3;
const titleMaxLength = 300;
const descriptionMaxLength = 1_000;

export interface LinkPreview {
  readonly url: string;
  readonly title: string;
  readonly description: string | null;
  readonly imageUrl: string | null;
}

interface HtmlResponse {
  readonly body: Buffer;
  readonly contentType: string;
  readonly url: URL;
}

interface RedirectResponse {
  readonly location: string | undefined;
}

type RequestResponse = HtmlResponse | RedirectResponse;

function parseHttpUrl(value: string, base?: URL): URL | null {
  try {
    const url = base === undefined ? new URL(value) : new URL(value, base);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username !== '' ||
      url.password !== '' ||
      url.port !== ''
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function normalizeLinkPreviewUrl(value: string): string | null {
  return parseHttpUrl(value)?.href ?? null;
}

export const getLinkPreviewUrlHash = (url: string): string =>
  createHash('sha256').update(url).digest('hex');

function networkHostname(value: URL | string): string {
  const hostname = typeof value === 'string' ? value : value.hostname;
  return hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;
}

function isPublicLookupAddress({ address, family }: LookupAddress): boolean {
  try {
    const parsed = ipaddr.parse(address);
    const expectedFamily = parsed.kind() === 'ipv4' ? 4 : 6;
    return family === expectedFamily && ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}

function waitForAbort<T>(start: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }

  const promise = start();
  return new Promise((resolve, reject) => {
    const removeAbortListener = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      removeAbortListener();
      reject(signal.reason);
    };

    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        removeAbortListener();
        resolve(value);
      },
      (error: unknown) => {
        removeAbortListener();
        reject(error);
      },
    );
    if (signal.aborted) {
      onAbort();
    }
  });
}

async function resolvePublicAddresses(
  hostname: string,
  signal: AbortSignal,
): Promise<readonly LookupAddress[] | null> {
  const literal = ipaddr.isValid(hostname) ? ipaddr.parse(hostname) : null;
  if (literal !== null) {
    return ipaddr.process(hostname).range() === 'unicast'
      ? [{ address: hostname, family: literal.kind() === 'ipv4' ? 4 : 6 }]
      : null;
  }

  try {
    const addresses = await waitForAbort(
      () =>
        new Promise<LookupAddress[]>((resolve, reject) => {
          dnsLookup(hostname, { all: true, order: 'verbatim' }, (error, results) => {
            if (error) {
              reject(error);
            } else {
              resolve(results);
            }
          });
        }),
      signal,
    );
    return addresses.length > 0 && addresses.every(isPublicLookupAddress) ? addresses : null;
  } catch {
    return null;
  }
}

function isHtmlContentType(headers: IncomingHttpHeaders): boolean {
  const contentType = headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
  return contentType === 'text/html' || contentType === 'application/xhtml+xml';
}

function hasSupportedContentEncoding(headers: IncomingHttpHeaders): boolean {
  const contentEncoding = headers['content-encoding']?.trim().toLowerCase();
  return contentEncoding === undefined || contentEncoding === '' || contentEncoding === 'identity';
}

function hasAcceptableContentLength(headers: IncomingHttpHeaders): boolean {
  const contentLength = headers['content-length'];
  if (contentLength === undefined) {
    return true;
  }

  if (!/^\d+$/u.test(contentLength)) {
    return false;
  }

  const length = Number(contentLength);
  return Number.isSafeInteger(length) && length <= maxHtmlBytes;
}

function networkError(): NodeJS.ErrnoException {
  return Object.assign(new Error('Could not resolve link-preview host'), { code: 'ENOTFOUND' });
}

function lookupWithPinnedAddresses(
  expectedHostname: string,
  addresses: readonly LookupAddress[],
): NonNullable<HttpRequestOptions['lookup']> {
  return (hostname, options, callback) => {
    if (networkHostname(hostname) !== expectedHostname) {
      callback(networkError(), '', 0);
      return;
    }

    const matchingAddresses =
      options.family === undefined || options.family === 0
        ? addresses
        : addresses.filter(
            ({ family }) =>
              family ===
              (options.family === 'IPv4' ? 4 : options.family === 'IPv6' ? 6 : options.family),
          );
    if (matchingAddresses.length === 0) {
      callback(networkError(), '', 0);
      return;
    }

    if (options.all) {
      callback(null, [...matchingAddresses]);
      return;
    }

    const address = matchingAddresses[0]!;
    callback(null, address.address, address.family);
  };
}

function isRedirectStatus(statusCode: number): boolean {
  return (
    statusCode === 301 ||
    statusCode === 302 ||
    statusCode === 303 ||
    statusCode === 307 ||
    statusCode === 308
  );
}

function requestHtml(
  url: URL,
  addresses: readonly LookupAddress[],
  signal: AbortSignal,
): Promise<RequestResponse | null> {
  return new Promise((resolve) => {
    const client = url.protocol === 'https:' ? https : http;
    let request: http.ClientRequest | undefined;
    let response: IncomingMessage | undefined;
    let settled = false;
    const finish = (result: RequestResponse | null) => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener('abort', onAbort);
      resolve(result);
    };
    const onAbort = () => {
      response?.destroy();
      request?.destroy();
      finish(null);
    };

    if (signal.aborted) {
      finish(null);
      return;
    }

    try {
      const hostname = networkHostname(url);
      const requestOptions: HttpRequestOptions & HttpsRequestOptions = {
        agent: false,
        headers: {
          Accept: 'text/html, application/xhtml+xml',
          'Accept-Encoding': 'identity',
        },
        lookup: lookupWithPinnedAddresses(hostname, addresses),
        method: 'GET',
        signal,
        ...(url.protocol === 'https:' && !ipaddr.isValid(hostname) ? { servername: hostname } : {}),
      };

      request = client.request(url, requestOptions, (incoming) => {
        response = incoming;
        const statusCode = incoming.statusCode ?? 0;
        if (isRedirectStatus(statusCode)) {
          const location = incoming.headers.location;
          incoming.destroy();
          finish({ location });
          return;
        }

        const contentType = incoming.headers['content-type'];
        if (
          statusCode !== 200 ||
          contentType === undefined ||
          !isHtmlContentType(incoming.headers) ||
          !hasSupportedContentEncoding(incoming.headers) ||
          !hasAcceptableContentLength(incoming.headers)
        ) {
          incoming.destroy();
          finish(null);
          return;
        }

        const chunks: Buffer[] = [];
        let size = 0;
        incoming.on('data', (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buffer.length;
          if (size > maxHtmlBytes) {
            incoming.destroy();
            request?.destroy();
            finish(null);
            return;
          }
          chunks.push(buffer);
        });
        incoming.on('end', () => finish({ body: Buffer.concat(chunks), contentType, url }));
        incoming.on('aborted', () => finish(null));
        incoming.on('error', () => finish(null));
      });

      request.on('error', () => finish(null));
      signal.addEventListener('abort', onAbort, { once: true });
      request.end();
    } catch {
      finish(null);
    }
  });
}

async function fetchHtml(initialUrl: URL, signal: AbortSignal): Promise<HtmlResponse | null> {
  let url = initialUrl;

  for (let redirectCount = 0; ; redirectCount++) {
    const hostname = networkHostname(url);
    const addresses = await resolvePublicAddresses(hostname, signal);
    if (!addresses) {
      return null;
    }

    const response = await requestHtml(url, addresses, signal);
    if (!response) {
      return null;
    }

    if ('location' in response) {
      if (redirectCount >= maxRedirects || !response.location?.trim()) {
        return null;
      }
      const redirectedUrl = parseHttpUrl(response.location, url);
      if (!redirectedUrl) {
        return null;
      }
      url = redirectedUrl;
      continue;
    }

    return response;
  }
}

function limitedText(value: string | null | undefined, maxLength: number): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength).trimEnd() || null;
}

function metaContent(document: Document, selector: string): string | null {
  return document.querySelector(selector)?.getAttribute('content') ?? null;
}

async function safeImageUrl(
  value: string | null,
  baseUrl: URL,
  signal: AbortSignal,
): Promise<string | null> {
  if (!value?.trim()) {
    return null;
  }

  const imageUrl = parseHttpUrl(value, baseUrl);
  if (imageUrl === null) {
    return null;
  }

  const addresses = await resolvePublicAddresses(networkHostname(imageUrl), signal);
  return addresses === null ? null : imageUrl.href;
}

export async function fetchLinkPreview(value: string): Promise<LinkPreview | null> {
  const url = parseHttpUrl(value);
  if (url === null) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetchHtml(url, controller.signal);
    if (response === null) {
      return null;
    }

    const document = new JSDOM(response.body, { contentType: response.contentType }).window
      .document;
    const title =
      limitedText(metaContent(document, 'meta[property="og:title"]'), titleMaxLength) ??
      limitedText(document.querySelector('title')?.textContent, titleMaxLength);
    if (title === null) {
      return null;
    }

    const description =
      limitedText(metaContent(document, 'meta[property="og:description"]'), descriptionMaxLength) ??
      limitedText(metaContent(document, 'meta[name="description"]'), descriptionMaxLength);
    const imageUrl = await safeImageUrl(
      metaContent(document, 'meta[property="og:image"]'),
      response.url,
      controller.signal,
    );

    return { url: url.href, title, description, imageUrl };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
