import assert from 'node:assert/strict';
import test from 'node:test';
import { isInputObjectType, isObjectType } from 'graphql';
import { schema } from './schema';

test('exposes Content Warning with the existing TipTap write contract', () => {
  const postContent = schema.getType('PostContent');
  const createPostInput = schema.getType('CreatePostInput');

  assert.ok(isObjectType(postContent));
  assert.ok(postContent.getFields().contentWarning);
  assert.equal(postContent.getFields().spoilerText, undefined);
  assert.equal(String(postContent.getFields().bodyJson?.type), 'TipTapDocument!');

  assert.ok(isInputObjectType(createPostInput));
  assert.equal(String(createPostInput.getFields().content?.type), 'TipTapDocument!');
  assert.equal(createPostInput.getFields().bodyText, undefined);
});
