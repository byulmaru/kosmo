import { Object as ActivityObject, OrderedCollection, OrderedCollectionPage } from '@fedify/vocab';
import { isHttpUri } from './activitypub-uri';
import type { DocumentLoader } from '@fedify/vocab';

const MAX_PAGES = 32;
const MAX_ITEMS = 500;

type TraversalFailure =
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

  const featuredObjectUri = new URL(featuredUri);
  if (!isHttpUri(featuredObjectUri)) {
    throw new TypeError('Remote Featured URI must use HTTP(S)');
  }
  const requestedFeaturedUri = featuredObjectUri.href;
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
      if (!isHttpUri(itemUri)) {
        throw new TypeError('Remote Featured item URI must use HTTP(S)');
      }
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
