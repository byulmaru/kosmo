import assert from 'node:assert/strict';
import test from 'node:test';
import { ValidationError } from '../error';
import { validatePostStructure } from './post-structure';

const postId = '00000000-0000-8000-8000-000000000001';
const contentId = '00000000-0000-8000-8000-000000000002';
const parentId = '00000000-0000-8000-8000-000000000003';
const sourceId = '00000000-0000-8000-8000-000000000004';

test('validatePostStructure는 다섯 Post 구조와 같은 Parent·Source 대상을 허용한다', () => {
  for (const structure of [
    { currentContentId: contentId, replyParentId: null, repostSourceId: null },
    { currentContentId: contentId, replyParentId: parentId, repostSourceId: null },
    { currentContentId: contentId, replyParentId: null, repostSourceId: sourceId },
    { currentContentId: contentId, replyParentId: parentId, repostSourceId: sourceId },
    { currentContentId: null, replyParentId: null, repostSourceId: sourceId },
    { currentContentId: contentId, replyParentId: parentId, repostSourceId: parentId },
  ]) {
    assert.doesNotThrow(() => validatePostStructure({ id: postId, ...structure }));
  }
});

test('validatePostStructure는 Content와 Source가 모두 없는 구조를 거부한다', () => {
  assert.throws(
    () =>
      validatePostStructure({
        currentContentId: null,
        id: postId,
        replyParentId: null,
        repostSourceId: null,
      }),
    (error) =>
      error instanceof ValidationError &&
      error.field === 'repostSourceId' &&
      error.message === 'Post must have content or a repost source',
  );
});

test('validatePostStructure는 Content 없는 Reply를 거부한다', () => {
  assert.throws(
    () =>
      validatePostStructure({
        currentContentId: null,
        id: postId,
        replyParentId: parentId,
        repostSourceId: sourceId,
      }),
    (error) =>
      error instanceof ValidationError &&
      error.field === 'replyParentId' &&
      error.message === 'Reply must have content',
  );
});

test('validatePostStructure는 두 직접 self-reference 관계를 field별로 거부한다', () => {
  assert.throws(
    () =>
      validatePostStructure({
        currentContentId: contentId,
        id: postId,
        replyParentId: postId,
        repostSourceId: null,
      }),
    (error) => error instanceof ValidationError && error.field === 'replyParentId',
  );
  assert.throws(
    () =>
      validatePostStructure({
        currentContentId: contentId,
        id: postId,
        replyParentId: null,
        repostSourceId: postId,
      }),
    (error) => error instanceof ValidationError && error.field === 'repostSourceId',
  );
});
