import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ValidationError } from '../error';
import {
  canonicalizePostContentDocument,
  postContentDocumentToText,
  validateLocalPostContentDocument,
} from './server';

const aliceProfileId = '019f6678-86fa-709b-984e-1520766b8441';

const documentWithMentions = (handles: readonly (string | undefined)[]) => ({
  version: 1,
  summary: null,
  body: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: handles.map((handle) => ({
          type: 'mention',
          attrs: {
            ...(handle === undefined ? {} : { handle }),
            profileId: aliceProfileId,
          },
        })),
      },
    ],
  },
});

describe('PostContent Mention limits', () => {
  it('allows 16 repeated body Mention nodes and rejects a 17th on local creation', () => {
    const withinLimit = canonicalizePostContentDocument(
      documentWithMentions(Array.from({ length: 16 }, () => '@alice')),
    );
    assert.deepEqual(
      validateLocalPostContentDocument(withinLimit, '@alice'.repeat(16)),
      withinLimit,
    );

    const overLimit = canonicalizePostContentDocument(
      documentWithMentions(Array.from({ length: 17 }, () => '@alice')),
    );
    assert.throws(
      () => validateLocalPostContentDocument(overLimit, '@alice'.repeat(17)),
      (error) => error instanceof ValidationError && error.field === 'mentions',
    );
  });

  it('limits only the username part of a stored qualified handle snapshot', () => {
    const qualifiedHandle = `@${'a'.repeat(64)}@${'long-domain-'.repeat(10)}.example`;
    const withinLimit = canonicalizePostContentDocument(documentWithMentions([qualifiedHandle]));
    assert.deepEqual(validateLocalPostContentDocument(withinLimit, 'mention'), withinLimit);

    const overLimit = canonicalizePostContentDocument(
      documentWithMentions([`@${'a'.repeat(65)}@example.com`]),
    );
    assert.throws(
      () => validateLocalPostContentDocument(overLimit, 'mention'),
      (error) => error instanceof ValidationError && error.field === 'mentions',
    );
  });

  it('keeps legacy reads permissive for many Mentions and long stored snapshots', () => {
    const legacyDocument = canonicalizePostContentDocument(
      documentWithMentions(Array.from({ length: 17 }, () => `@${'a'.repeat(65)}@example.com`)),
    );

    assert.equal(
      postContentDocumentToText(legacyDocument),
      Array.from({ length: 17 }, () => `@${'a'.repeat(65)}@example.com`).join(''),
    );
  });
});
