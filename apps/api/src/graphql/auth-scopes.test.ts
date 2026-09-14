import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { test } from 'node:test';
import DataLoader from 'dataloader';
import { createAuthScopes } from './auth-scopes';
import { Post } from './resolvers/post/ref';
import type { UserContext } from '@/context';

test('canViewPost shares the request-scoped loader with the Post ref', async () => {
  const rows = new Map<string, { id: string } | null>([
    ['visible', { id: 'visible' }],
    ['hidden', null],
  ]);
  const context = {
    $loaders: new Map<string, DataLoader<unknown, unknown>>(),
  } as unknown as UserContext;
  let loaderCreationCount = 0;
  let underlyingLoadCount = 0;
  context.loader = ((params) => {
    const cached = context.$loaders.get(params.name);
    if (cached) {
      return cached as never;
    }

    loaderCreationCount += 1;
    const loader = new DataLoader(
      async (ids) => {
        underlyingLoadCount += 1;
        return ids.map((id) => rows.get(id as string) ?? null);
      },
      { cache: params.cache ?? false },
    );
    context.$loaders.set(params.name, loader);
    return loader as never;
  }) as UserContext['loader'];

  const scopes = createAuthScopes(context);
  const postLoader = Post.getDataloader(context);

  assert.equal(await scopes.canViewPost('visible'), true);
  assert.deepEqual(await postLoader.load('visible'), { id: 'visible' });
  assert.equal(await scopes.canViewPost('visible'), true);
  assert.equal(underlyingLoadCount, 1);
  assert.equal(await scopes.canViewPost('hidden'), false);
  assert.equal(underlyingLoadCount, 2);
  assert.equal(loaderCreationCount, 1);
  assert.equal(context.$loaders.size, 1);
});
