import {
  Note,
  Object as ActivityObject,
  OrderedCollection,
  OrderedCollectionPage,
} from '@fedify/vocab';
import { db, first, Posts } from '@kosmo/core/db';
import { eq } from 'drizzle-orm';
import { isHttpUri } from './activitypub-uri';
import { materializeHydratedRemoteNote } from './inbound-create-note';
import { replaceRemoteFeaturedSnapshot } from './remote-featured-snapshot';
import type { Context } from '@fedify/fedify';
import type { DocumentLoader } from '@fedify/vocab';

const MAX_PAGES = 32;
const MAX_ITEMS = 500;
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const MAX_DURATION_MS = 30_000;

type TraversalFailure =
  | 'aborted'
  | 'deadline_exceeded'
  | 'document_budget_exceeded'
  | 'duplicate_item_uri'
  | 'duplicate_page_uri'
  | 'item_limit_exceeded'
  | 'page_limit_exceeded';

class RemoteFeaturedTraversalError extends Error {
  readonly code: TraversalFailure;

  constructor(code: TraversalFailure) {
    super(`Remote Featured traversal failed: ${code}`);
    this.name = 'RemoteFeaturedTraversalError';
    this.code = code;
  }
}

const createAbortError = (signal: AbortSignal, deadlineReached: () => boolean) =>
  deadlineReached() || signal.reason instanceof RemoteFeaturedTraversalError
    ? new RemoteFeaturedTraversalError('deadline_exceeded')
    : new RemoteFeaturedTraversalError('aborted');

const throwIfAborted = (signal: AbortSignal, deadlineReached: () => boolean): void => {
  if (signal.aborted) {
    throw createAbortError(signal, deadlineReached);
  }
};

const raceAbort = async <T>(
  operation: Promise<T>,
  signal: AbortSignal,
  deadlineReached: () => boolean,
): Promise<T> => {
  let rejectOnAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        rejectOnAbort = () => reject(createAbortError(signal, deadlineReached));
        if (signal.aborted) {
          rejectOnAbort();
        } else {
          signal.addEventListener('abort', rejectOnAbort, { once: true });
        }
      }),
    ]);
  } finally {
    if (rejectOnAbort) {
      signal.removeEventListener('abort', rejectOnAbort);
    }
  }
};

const parsedDocumentBytes = (document: unknown): number => {
  const serialized = JSON.stringify(document);
  if (serialized === undefined) {
    return 0;
  }
  return new TextEncoder().encode(serialized).byteLength;
};

export type CollectRemoteFeaturedItemUrisOptions = {
  documentLoader: DocumentLoader;
  featuredUri: URL | string;
  signal?: AbortSignal;
};

/**
 * Collects ordered Featured item URIs without fetching the item documents.
 *
 * The document budget counts the UTF-8 size of parsed DocumentLoader results;
 * it is not a raw wire-byte limit.
 */
export const collectRemoteFeaturedItemUris = async ({
  documentLoader,
  featuredUri,
  signal: externalSignal,
}: CollectRemoteFeaturedItemUrisOptions): Promise<URL[]> => {
  const controller = new AbortController();
  let deadlineReached = false;
  const deadline = setTimeout(() => {
    deadlineReached = true;
    controller.abort(new RemoteFeaturedTraversalError('deadline_exceeded'));
  }, MAX_DURATION_MS);
  const forwardAbort = () => {
    controller.abort(externalSignal?.reason);
  };
  if (externalSignal?.aborted) {
    forwardAbort();
  }
  externalSignal?.addEventListener('abort', forwardAbort, { once: true });

  let documentBytes = 0;
  const loadedDocument = async (url: string) => {
    throwIfAborted(controller.signal, () => deadlineReached);
    const loaded = await raceAbort(
      documentLoader(url, { signal: controller.signal }),
      controller.signal,
      () => deadlineReached,
    );

    documentBytes += parsedDocumentBytes(loaded.document);
    if (documentBytes > MAX_DOCUMENT_BYTES) {
      throw new RemoteFeaturedTraversalError('document_budget_exceeded');
    }
    return loaded;
  };
  const parseObject = async (url: string) => {
    const loaded = await loadedDocument(url);
    return ActivityObject.fromJsonLd(loaded.document, {
      baseUrl: new URL(loaded.documentUrl),
      contextLoader: loadedDocument,
      documentLoader: loadedDocument,
    });
  };

  try {
    throwIfAborted(controller.signal, () => deadlineReached);
    const requestedFeaturedUri = new URL(featuredUri).href;
    const root = await parseObject(requestedFeaturedUri);
    if (!(root instanceof OrderedCollection || root instanceof OrderedCollectionPage)) {
      throw new TypeError('Remote Featured document must be an OrderedCollection or page');
    }
    if (root.id?.href !== requestedFeaturedUri) {
      throw new TypeError('Remote Featured document id must match the requested URI');
    }

    const pageUris = new Set<string>();
    const itemUris = new Set<string>();
    const orderedItems: URL[] = [];

    const collectItems = (page: OrderedCollection | OrderedCollectionPage) => {
      const pageItems = page.itemIds;
      if (orderedItems.length + pageItems.length > MAX_ITEMS) {
        throw new RemoteFeaturedTraversalError('item_limit_exceeded');
      }
      for (const itemUri of pageItems) {
        if (itemUris.has(itemUri.href)) {
          throw new RemoteFeaturedTraversalError('duplicate_item_uri');
        }
        itemUris.add(itemUri.href);
        orderedItems.push(itemUri);
      }
    };

    let page: OrderedCollectionPage | null;
    if (root instanceof OrderedCollectionPage) {
      page = root;
    } else {
      const firstUri = root.firstId?.href;
      if (firstUri !== undefined && root.itemIds.length > 0) {
        throw new TypeError('Remote Featured collection cannot mix inline items and pages');
      }
      const firstPage = await root.getFirst({
        contextLoader: loadedDocument,
        crossOrigin: 'throw',
        documentLoader: loadedDocument,
      });
      if (firstPage !== null && !(firstPage instanceof OrderedCollectionPage)) {
        throw new TypeError('Remote Featured first page must be an OrderedCollectionPage');
      }
      if (firstPage !== null && firstPage.id?.href !== firstUri) {
        throw new TypeError('Remote Featured first page id must match its requested URI');
      }
      page = firstPage;
      if (firstPage === null) {
        collectItems(root);
      }
    }

    let pageCount = 0;
    while (page !== null) {
      throwIfAborted(controller.signal, () => deadlineReached);
      pageCount += 1;
      if (pageCount > MAX_PAGES) {
        throw new RemoteFeaturedTraversalError('page_limit_exceeded');
      }

      const pageUri = page.id?.href;
      if (pageUri === undefined) {
        throw new TypeError('Remote Featured page must have a URI');
      }
      if (pageUris.has(pageUri)) {
        throw new RemoteFeaturedTraversalError('duplicate_page_uri');
      }
      pageUris.add(pageUri);
      collectItems(page);

      const nextUri = page.nextId?.href;
      if (nextUri !== undefined && pageUris.has(nextUri)) {
        throw new RemoteFeaturedTraversalError('duplicate_page_uri');
      }
      if (nextUri !== undefined && pageCount >= MAX_PAGES) {
        throw new RemoteFeaturedTraversalError('page_limit_exceeded');
      }
      const nextPage = await page.getNext({
        contextLoader: loadedDocument,
        crossOrigin: 'throw',
        documentLoader: loadedDocument,
      });
      if (nextPage !== null && !(nextPage instanceof OrderedCollectionPage)) {
        throw new TypeError('Remote Featured next page must be an OrderedCollectionPage');
      }
      if (nextPage !== null && nextPage.id?.href !== nextUri) {
        throw new TypeError('Remote Featured next page id must match its requested URI');
      }
      page = nextPage;
    }

    return orderedItems;
  } finally {
    clearTimeout(deadline);
    externalSignal?.removeEventListener('abort', forwardAbort);
  }
};

export const syncRemoteFeaturedSnapshot = async ({
  actorUri,
  context,
  documentLoader,
  featuredUri,
  followerProfileId,
  profileId,
  revision,
  signal,
}: {
  actorUri: string;
  context: Pick<Context<void>, 'canonicalOrigin' | 'lookupObject' | 'parseUri'>;
  documentLoader: DocumentLoader;
  featuredUri: string;
  followerProfileId?: string;
  profileId: string;
  revision: number;
  signal?: AbortSignal;
}): Promise<boolean> => {
  if (!isHttpUri(new URL(featuredUri))) {
    throw new TypeError('Remote Featured URI must use HTTP(S)');
  }

  const controller = new AbortController();
  const deadline = setTimeout(
    () => controller.abort(new RemoteFeaturedTraversalError('deadline_exceeded')),
    MAX_DURATION_MS,
  );
  const forwardAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) {
    forwardAbort();
  }
  signal?.addEventListener('abort', forwardAbort, { once: true });
  let bytes = 0;
  const boundedLoader: DocumentLoader = async (url, options) => {
    throwIfAborted(
      controller.signal,
      () => controller.signal.reason instanceof RemoteFeaturedTraversalError,
    );
    const loaded = await raceAbort(
      documentLoader(url, { ...options, signal: controller.signal }),
      controller.signal,
      () => controller.signal.reason instanceof RemoteFeaturedTraversalError,
    );
    throwIfAborted(
      controller.signal,
      () => controller.signal.reason instanceof RemoteFeaturedTraversalError,
    );
    bytes += parsedDocumentBytes(loaded.document);
    if (bytes > MAX_DOCUMENT_BYTES) {
      throw new RemoteFeaturedTraversalError('document_budget_exceeded');
    }
    return loaded;
  };

  try {
    const itemUris = await collectRemoteFeaturedItemUris({
      documentLoader: boundedLoader,
      featuredUri,
      signal: controller.signal,
    });
    const postIds: string[] = [];
    for (const objectUri of itemUris) {
      throwIfAborted(
        controller.signal,
        () => controller.signal.reason instanceof RemoteFeaturedTraversalError,
      );
      if (!isHttpUri(objectUri)) {
        throw new TypeError('Remote Featured item URI must use HTTP(S)');
      }
      const note = await raceAbort(
        context.lookupObject(objectUri, {
          contextLoader: boundedLoader,
          crossOrigin: 'throw',
          documentLoader: boundedLoader,
        }),
        controller.signal,
        () => controller.signal.reason instanceof RemoteFeaturedTraversalError,
      );
      if (!(note instanceof Note) || note.id?.href !== objectUri.href) {
        throw new TypeError('Remote Featured item must be a Note at its advertised URI');
      }
      const result = await materializeHydratedRemoteNote({
        audience: { advertisingActorUri: actorUri, followerProfileId },
        context,
        note,
        objectUri,
        observation: { activityType: 'Unknown', handler: 'create' },
        receivedAt: Temporal.Now.instant(),
      });
      if (result.status === 'rejected') {
        throw new TypeError(`Featured Note rejected: ${result.reason}`);
      }
      const post = await db
        .select({ profileId: Posts.profileId })
        .from(Posts)
        .where(eq(Posts.id, result.postId))
        .limit(1)
        .then(first);
      if (post?.profileId !== profileId) {
        throw new TypeError('Featured Note rejected: existing post belongs to another profile');
      }
      postIds.push(result.postId);
    }
    throwIfAborted(
      controller.signal,
      () => controller.signal.reason instanceof RemoteFeaturedTraversalError,
    );
    return replaceRemoteFeaturedSnapshot({ actorUri, featuredUri, postIds, profileId, revision });
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener('abort', forwardAbort);
  }
};
