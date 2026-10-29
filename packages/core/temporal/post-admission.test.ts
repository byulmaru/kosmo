import assert from 'node:assert/strict';
import test from 'node:test';
import { validate, version } from 'uuid';
import { ValidationError } from '../error';
import {
  postCreateIdentities,
  postCreateWorkflowArgs,
  quotePostCreateInput,
} from './post-admission';
import type { PostCreateInput } from './post';

const input: PostCreateInput = {
  admissionId: '1792328400000:3f119234-159a-4bd7-971c-7ad6a94f8087',
  profileId: '01950000-0000-7000-8000-000000000002',
  origin: 'LOCAL',
  visibility: 'PUBLIC',
  repostSourceId: '01950000-0000-7000-8000-000000000003',
  document: { version: 1, summary: null, body: { type: 'doc', content: [] } },
};

test('Quote identities bind one Post and its initial payload to existing UUIDv7 keys', () => {
  const initial = postCreateIdentities(input);
  assert.deepEqual(postCreateIdentities({ ...input }), initial);
  assert.notEqual(initial.postId, initial.contentId);
  for (const id of Object.values(initial)) {
    assert.equal(validate(id), true);
    assert.equal(version(id), 7);
  }
  for (const changed of [
    { ...input, profileId: input.repostSourceId! },
    { ...input, authoredBodyText: 'different' },
    { ...input, visibility: 'UNLISTED' as const },
    { ...input, media: [{ mediaId: input.profileId, altText: 'different' }] },
  ]) {
    const identities = postCreateIdentities(changed);
    assert.equal(identities.postId, initial.postId);
    assert.notEqual(identities.contentId, initial.contentId);
  }
  assert.notEqual(
    postCreateIdentities({ ...input, admissionId: input.admissionId.replace('8087', '8088') })
      .postId,
    initial.postId,
  );
});

test('Quote admission rejects a malformed UUID suffix', () => {
  assert.throws(
    () =>
      postCreateIdentities({
        ...input,
        admissionId: '1792328400000:------------------------------------',
      }),
    ValidationError,
  );
});

test('common Quote creation keeps its request identity and binds changed input to the same Post', () => {
  const local = {
    admissionId: input.admissionId,
    accountId: '01950000-0000-7000-8000-000000000004',
    bodyText: 'original Quote',
    contentWarning: null,
    media: [],
    origin: 'LOCAL' as const,
    profileId: input.profileId,
    repostSourceId: input.repostSourceId!,
    visibility: 'PUBLIC' as const,
  };
  const initial = postCreateWorkflowArgs(local);
  assert.deepEqual(postCreateWorkflowArgs({ ...local }), initial);
  const changed = { ...local, bodyText: 'changed Quote' };
  assert.notEqual(postCreateWorkflowArgs(changed).requestId, initial.requestId);
  assert.equal(
    postCreateIdentities(quotePostCreateInput(changed)).postId,
    postCreateIdentities(quotePostCreateInput(local)).postId,
  );
  for (const candidate of [
    { ...local, contentWarning: 'changed' },
    { ...local, sensitiveMedia: true },
    { ...local, profileId: local.repostSourceId },
    { ...local, media: [{ mediaId: local.profileId, altText: 'changed' }] },
  ]) {
    assert.notEqual(postCreateWorkflowArgs(candidate).requestId, initial.requestId);
  }
});

test('ordinary creation gets a new request and cannot reuse a Quote admission without its Source', () => {
  const local = {
    bodyText: 'ordinary Post',
    origin: 'LOCAL' as const,
    profileId: input.profileId,
    visibility: 'PUBLIC' as const,
  };
  assert.notEqual(postCreateWorkflowArgs(local).requestId, postCreateWorkflowArgs(local).requestId);
  assert.throws(
    () => postCreateWorkflowArgs({ ...local, admissionId: input.admissionId }),
    ValidationError,
  );
});
