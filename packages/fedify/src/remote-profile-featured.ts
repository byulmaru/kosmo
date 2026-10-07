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
import type { Context } from '@fedify/fedify';
import type { DocumentLoader } from '@fedify/vocab';

const MAX_PAGES = 32;
const MAX_ITEMS = 500;
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

type TraversalFailure =
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
};

/** Collects ordered Featured item URIs without fetching the item documents. */
export const collectRemoteFeaturedItemUris = async ({
  documentLoader,
  featuredUri,
}: CollectRemoteFeaturedItemUrisOptions): Promise<URL[]> => {
  const parseObject = async (url: string) => {
    const loaded = await documentLoader(url);
    return ActivityObject.fromJsonLd(loaded.document, {
      baseUrl: new URL(loaded.documentUrl),
      contextLoader: documentLoader,
      documentLoader,
    });
  };

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
      contextLoader: documentLoader,
      crossOrigin: 'throw',
      documentLoader,
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
      contextLoader: documentLoader,
      crossOrigin: 'throw',
      documentLoader,
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
};

export const collectRemoteFeaturedPostIds = async ({
  actorUri,
  context,
  documentLoader,
  featuredUri,
  profileId,
}: {
  actorUri: string;
  context: Pick<Context<void>, 'canonicalOrigin' | 'lookupObject' | 'parseUri'>;
  documentLoader: DocumentLoader;
  featuredUri: string;
  profileId: string;
}): Promise<string[]> => {
  if (!isHttpUri(new URL(featuredUri))) {
    throw new TypeError('Remote Featured URI must use HTTP(S)');
  }

  let bytes = 0;
  const boundedLoader: DocumentLoader = async (url, options) => {
    const loaded = await documentLoader(url, {
      ...options,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // The budget counts UTF-8 bytes of parsed documents, not raw response bytes.
    bytes += parsedDocumentBytes(loaded.document);
    if (bytes > MAX_DOCUMENT_BYTES) {
      throw new RemoteFeaturedTraversalError('document_budget_exceeded');
    }
    return loaded;
  };

  const itemUris = await collectRemoteFeaturedItemUris({
    documentLoader: boundedLoader,
    featuredUri,
  });
  const postIds: string[] = [];
  for (const objectUri of itemUris) {
    if (!isHttpUri(objectUri)) {
      throw new TypeError('Remote Featured item URI must use HTTP(S)');
    }
    const note = await context.lookupObject(objectUri, {
      contextLoader: boundedLoader,
      crossOrigin: 'throw',
      documentLoader: boundedLoader,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!(note instanceof Note) || note.id?.href !== objectUri.href) {
      throw new TypeError('Remote Featured item must be a Note at its advertised URI');
    }
    const result = await materializeHydratedRemoteNote({
      advertisingActorUri: actorUri,
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
  return postIds;
};
