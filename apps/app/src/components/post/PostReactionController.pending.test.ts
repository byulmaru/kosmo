import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  finishReactionPending,
  getReactionPendingSnapshot,
  subscribeReactionPending,
  tryStartReactionPending,
} from './PostReactionController.pending';
import type { Environment } from 'relay-runtime';

const createEnvironment = () => ({}) as Environment;

describe('PostReactionController shared pending state', () => {
  it('atomically blocks only the same actor, Post, and Type', () => {
    const actorA = createEnvironment();
    const actorB = createEnvironment();

    assert.equal(tryStartReactionPending(actorA, 'post-a', 'HEART'), true);
    assert.equal(tryStartReactionPending(actorA, 'post-a', 'HEART'), false);
    assert.equal(tryStartReactionPending(actorA, 'post-a', 'EYES'), true);
    assert.equal(tryStartReactionPending(actorA, 'post-b', 'HEART'), true);
    assert.equal(tryStartReactionPending(actorB, 'post-a', 'HEART'), true);
    assert.deepEqual(getReactionPendingSnapshot(actorA, 'post-a'), ['HEART', 'EYES']);
    assert.deepEqual(getReactionPendingSnapshot(actorB, 'post-a'), ['HEART']);

    finishReactionPending(actorA, 'post-a', 'HEART');
    assert.deepEqual(getReactionPendingSnapshot(actorA, 'post-a'), ['EYES']);
    finishReactionPending(actorA, 'post-a', 'EYES');
    assert.deepEqual(getReactionPendingSnapshot(actorA, 'post-a'), []);
    assert.deepEqual(getReactionPendingSnapshot(actorA, 'post-b'), ['HEART']);
    assert.deepEqual(getReactionPendingSnapshot(actorB, 'post-a'), ['HEART']);
  });

  it('publishes changes and removes listeners without changing the stable empty snapshot', () => {
    const environment = createEnvironment();
    const snapshots: ReadonlyArray<string>[] = [];
    const unsubscribe = subscribeReactionPending(environment, 'post-a', () => {
      snapshots.push(getReactionPendingSnapshot(environment, 'post-a'));
    });
    const emptySnapshot = getReactionPendingSnapshot(environment, 'post-a');

    assert.equal(tryStartReactionPending(environment, 'post-a', 'HEART'), true);
    finishReactionPending(environment, 'post-a', 'HEART');
    assert.deepEqual(snapshots, [['HEART'], emptySnapshot]);
    assert.strictEqual(getReactionPendingSnapshot(environment, 'post-a'), emptySnapshot);

    unsubscribe();
    assert.equal(tryStartReactionPending(environment, 'post-a', 'EYES'), true);
    finishReactionPending(environment, 'post-a', 'EYES');
    assert.deepEqual(snapshots, [['HEART'], emptySnapshot]);
  });
});
