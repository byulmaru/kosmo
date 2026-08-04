import assert from 'node:assert/strict';
import test from 'node:test';

test('shares reveal state by Post identity and isolates different Posts', async () => {
  const { createPostContentWarningRevealStore } = await import('./PostContentWarningRevealContext');
  const store = createPostContentWarningRevealStore();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });

  assert.equal(store.get('post-a'), false);
  assert.equal(store.get('post-b'), false);

  store.set('post-a', true);

  assert.equal(store.get('post-a'), true);
  assert.equal(store.get('post-b'), false);
  assert.equal(notifications, 1);

  store.set('post-a', true);
  assert.equal(notifications, 1);

  store.set('post-a', false);
  assert.equal(store.get('post-a'), false);
  assert.equal(notifications, 2);

  unsubscribe();
  store.set('post-b', true);
  assert.equal(notifications, 2);
});
