import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('Post action 실행 가능성', () => {
  it('target, session, selected Profile 우선순위를 분리한다', async () => {
    const policy = await import('./postActionAvailability').catch(() => null);

    assert.ok(policy, 'postActionAvailability 정책이 구현되어야 한다.');
    assert.deepEqual(
      policy.resolvePostActionExecution({
        selectedProfileId: null,
        status: 'guest',
        targetEligible: false,
      }),
      { kind: 'disabled', reason: 'target' },
    );
    assert.deepEqual(
      policy.resolvePostActionExecution({
        selectedProfileId: null,
        status: 'guest',
        targetEligible: true,
      }),
      { kind: 'resolution-required', reason: 'guest' },
    );
    assert.deepEqual(
      policy.resolvePostActionExecution({
        selectedProfileId: null,
        status: 'valid',
        targetEligible: true,
      }),
      { kind: 'resolution-required', reason: 'profile' },
    );
    assert.deepEqual(
      policy.resolvePostActionExecution({
        selectedProfileId: 'profile-id',
        status: 'valid',
        targetEligible: true,
      }),
      { kind: 'enabled' },
    );
    assert.deepEqual(
      policy.resolvePostActionExecution({
        selectedProfileId: null,
        status: 'error',
        targetEligible: true,
      }),
      { kind: 'disabled', reason: 'session-error' },
    );
  });

  it('Repost visibility와 selected Profile author 조건을 분리한다', async () => {
    const policy = await import('./postActionAvailability').catch(() => null);

    assert.ok(policy);
    assert.equal(
      policy.isRepostTargetEligible({
        authorProfileId: 'author-id',
        selectedProfileId: 'viewer-id',
        visibility: 'PUBLIC',
      }),
      true,
    );
    assert.equal(
      policy.isRepostTargetEligible({
        authorProfileId: 'author-id',
        selectedProfileId: null,
        visibility: 'UNLISTED',
      }),
      true,
    );
    assert.equal(
      policy.isRepostTargetEligible({
        authorProfileId: 'author-id',
        selectedProfileId: 'viewer-id',
        visibility: 'FOLLOWERS',
      }),
      false,
    );
    assert.equal(
      policy.isRepostTargetEligible({
        authorProfileId: 'author-id',
        selectedProfileId: 'author-id',
        visibility: 'FOLLOWERS',
      }),
      true,
    );
    assert.equal(
      policy.isRepostTargetEligible({
        authorProfileId: 'author-id',
        selectedProfileId: 'author-id',
        visibility: 'DIRECT',
      }),
      false,
    );
  });
});
