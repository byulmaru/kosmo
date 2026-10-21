import assert from 'node:assert/strict';
import test from 'node:test';
import { validate, version } from 'uuid';
import { ValidationError } from '../error';
import { postCreateIdentities } from './post-admission';
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
  assert.deepEqual(postCreateIdentities({ ...input, quotePolicy: 'EVERYONE' }), initial);
  assert.notEqual(initial.postId, initial.contentId);
  for (const id of Object.values(initial)) {
    assert.equal(validate(id), true);
    assert.equal(version(id), 7);
  }
  for (const changed of [
    { ...input, profileId: input.repostSourceId! },
    { ...input, authoredBodyText: 'different' },
    { ...input, visibility: 'UNLISTED' as const },
    { ...input, quotePolicy: 'AUTHOR' as const },
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
