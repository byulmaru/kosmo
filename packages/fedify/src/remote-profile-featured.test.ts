import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OrderedCollection, OrderedCollectionPage } from '@fedify/vocab';
import { collectRemoteFeaturedItemUris } from './remote-profile-featured';
import type { DocumentLoader } from '@fedify/vocab';

const collectionUri = new URL('https://remote.example/users/alice/featured');

const serialize = async (object: OrderedCollection | OrderedCollectionPage) =>
  object.toJsonLd({ format: 'expand' });

const createLoader = async (
  objects: (OrderedCollection | OrderedCollectionPage)[],
  aliases: Map<string, unknown> = new Map(),
) => {
  const documents = new Map<string, unknown>();
  for (const object of objects) {
    assert.ok(object.id);
    documents.set(object.id.href, await serialize(object));
  }

  const documentLoader: DocumentLoader = async (url) => {
    const document = aliases.get(url) ?? documents.get(url);
    if (document === undefined) {
      throw new Error(`Unexpected Featured document URL: ${url}`);
    }
    return { contextUrl: null, document, documentUrl: url };
  };
  return documentLoader;
};

test('collects ordered item URIs across pages', async () => {
  const pageOneUri = new URL(`${collectionUri.href}?page=1`);
  const pageTwoUri = new URL(`${collectionUri.href}?page=2`);
  const itemOneUri = new URL('https://remote.example/notes/1');
  const itemTwoUri = new URL('https://remote.example/notes/2');
  const itemThreeUri = new URL('https://remote.example/notes/3');
  const documentLoader = await createLoader([
    new OrderedCollection({ id: collectionUri, first: pageOneUri }),
    new OrderedCollectionPage({
      id: pageOneUri,
      items: [itemOneUri, itemTwoUri],
      next: pageTwoUri,
      partOf: collectionUri,
    }),
    new OrderedCollectionPage({
      id: pageTwoUri,
      items: [itemThreeUri],
      partOf: collectionUri,
    }),
  ]);

  const itemUris = await collectRemoteFeaturedItemUris({
    documentLoader,
    featuredUri: collectionUri,
  });

  assert.deepEqual(
    itemUris.map((uri) => uri.href),
    [itemOneUri.href, itemTwoUri.href, itemThreeUri.href],
  );
});

test('continues collection after more than 30 seconds across loader calls', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pageUri = new URL(`${collectionUri.href}?page=slow`);
    const itemUri = new URL('https://remote.example/notes/slow');
    const documents = new Map([
      [
        collectionUri.href,
        await serialize(new OrderedCollection({ id: collectionUri, first: pageUri })),
      ],
      [pageUri.href, await serialize(new OrderedCollectionPage({ id: pageUri, items: [itemUri] }))],
    ]);
    const documentLoader: DocumentLoader = async (url) => {
      if (url === pageUri.href) {
        t.mock.timers.tick(30_001);
      }
      const document = documents.get(url);
      assert.ok(document);
      return { contextUrl: null, document, documentUrl: url };
    };

    const itemUris = await collectRemoteFeaturedItemUris({
      documentLoader,
      featuredUri: collectionUri,
    });

    assert.deepEqual(
      itemUris.map((uri) => uri.href),
      [itemUri.href],
    );
  } finally {
    t.mock.timers.reset();
  }
});

test('rejects duplicate item URIs and page cycles', async () => {
  const pageUri = new URL(`${collectionUri.href}?page=cycle`);
  const itemUri = new URL('https://remote.example/notes/duplicate');
  const duplicateItemLoader = await createLoader([
    new OrderedCollection({ id: collectionUri, first: pageUri }),
    new OrderedCollectionPage({
      id: pageUri,
      items: [itemUri, itemUri],
      partOf: collectionUri,
    }),
  ]);
  await assert.rejects(
    collectRemoteFeaturedItemUris({
      documentLoader: duplicateItemLoader,
      featuredUri: collectionUri,
    }),
    (error: unknown) => error instanceof Error && error.message.includes('duplicate_item_uri'),
  );

  const cycleLoader = await createLoader([
    new OrderedCollection({ id: collectionUri, first: pageUri }),
    new OrderedCollectionPage({
      id: pageUri,
      items: [itemUri],
      next: pageUri,
      partOf: collectionUri,
    }),
  ]);
  await assert.rejects(
    collectRemoteFeaturedItemUris({ documentLoader: cycleLoader, featuredUri: collectionUri }),
    (error: unknown) => error instanceof Error && error.message.includes('duplicate_page_uri'),
  );
});

test('rejects mixed inline items and mismatched fetched page IDs', async () => {
  const pageUri = new URL(`${collectionUri.href}?page=first`);
  const wrongPageUri = new URL(`${collectionUri.href}?page=wrong`);
  const inlineItemUri = new URL('https://remote.example/notes/inline');
  const mixedLoader = await createLoader([
    new OrderedCollection({ id: collectionUri, first: pageUri, items: [inlineItemUri] }),
  ]);
  await assert.rejects(
    collectRemoteFeaturedItemUris({ documentLoader: mixedLoader, featuredUri: collectionUri }),
    /cannot mix inline items and pages/u,
  );

  const mismatchedPageDocument = await serialize(
    new OrderedCollectionPage({ id: wrongPageUri, items: [inlineItemUri] }),
  );
  const mismatchedLoader = await createLoader(
    [new OrderedCollection({ id: collectionUri, first: pageUri })],
    new Map([[pageUri.href, mismatchedPageDocument]]),
  );
  await assert.rejects(
    collectRemoteFeaturedItemUris({ documentLoader: mismatchedLoader, featuredUri: collectionUri }),
    /first page id must match/u,
  );
});

test('rejects page and item limit exhaustion', async () => {
  const item = (index: number) => new URL(`https://remote.example/notes/${index}`);
  const itemLimitPage = new URL(`${collectionUri.href}?page=item-limit`);
  const itemLimitLoader = await createLoader([
    new OrderedCollection({ id: collectionUri, first: itemLimitPage }),
    new OrderedCollectionPage({
      id: itemLimitPage,
      items: Array.from({ length: 501 }, (_, index) => item(index)),
    }),
  ]);
  await assert.rejects(
    collectRemoteFeaturedItemUris({
      documentLoader: itemLimitLoader,
      featuredUri: collectionUri,
    }),
    /item_limit_exceeded/u,
  );

  const pageObjects: OrderedCollectionPage[] = [];
  for (let index = 0; index < 33; index += 1) {
    const id = new URL(`${collectionUri.href}?page=${index}`);
    const next = index < 32 ? new URL(`${collectionUri.href}?page=${index + 1}`) : undefined;
    pageObjects.push(
      new OrderedCollectionPage({
        id,
        items: [item(index)],
        ...(next ? { next } : {}),
      }),
    );
  }
  const pageLimitLoader = await createLoader([
    new OrderedCollection({ id: collectionUri, first: pageObjects[0].id }),
    ...pageObjects,
  ]);
  await assert.rejects(
    collectRemoteFeaturedItemUris({
      documentLoader: pageLimitLoader,
      featuredUri: collectionUri,
    }),
    /page_limit_exceeded/u,
  );
});

test('fails the complete traversal when a later page loader fails', async () => {
  const pageOneUri = new URL(`${collectionUri.href}?page=1`);
  const pageTwoUri = new URL(`${collectionUri.href}?page=2`);
  const pageOne = new OrderedCollectionPage({
    id: pageOneUri,
    items: [new URL('https://remote.example/notes/1')],
    next: pageTwoUri,
  });
  const documentLoader = await createLoader([
    new OrderedCollection({ id: collectionUri, first: pageOneUri }),
    pageOne,
  ]);
  await assert.rejects(
    collectRemoteFeaturedItemUris({ documentLoader, featuredUri: collectionUri }),
    /Unexpected Featured document URL/u,
  );
});
