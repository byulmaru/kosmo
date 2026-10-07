import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PostComposerControllerProps as PostComposerProps } from './PostComposerController';

const typecheckPostComposerRelationships = () => {
  const profile = {} as PostComposerProps['profile'];
  void ({ profile, replyParentId: 'post-parent' } satisfies PostComposerProps);
  void ({ profile, repostSourceId: 'post-source' } satisfies PostComposerProps);
  // @ts-expect-error Reply와 Quote 관계 입력은 동시에 제공할 수 없다.
  const invalidRelationships: PostComposerProps = {
    profile,
    replyParentId: 'post-parent',
    repostSourceId: 'post-source',
  };
  void invalidRelationships;
};

const typecheckPostComposerPresentations = () => {
  const profile = {} as PostComposerProps['profile'];
  void ({
    onExpand: () => undefined,
    onRequestClose: () => undefined,
    presentation: 'rail',
    profile,
  } satisfies PostComposerProps);
  void ({
    onRequestClose: () => undefined,
    presentation: 'overlay',
    profile,
  } satisfies PostComposerProps);
  void ({
    onRequestClose: () => undefined,
    presentation: 'mobile',
    profile,
  } satisfies PostComposerProps);
  // @ts-expect-error Rail은 활성 Expand control의 callback을 필수로 제공한다.
  const invalidRail: PostComposerProps = {
    onRequestClose: () => undefined,
    presentation: 'rail',
    profile,
  };
  // @ts-expect-error Overlay는 활성 close control의 callback을 필수로 제공한다.
  const invalidOverlay: PostComposerProps = { presentation: 'overlay', profile };
  // @ts-expect-error Mobile은 활성 close control의 callback을 필수로 제공한다.
  const invalidMobile: PostComposerProps = { presentation: 'mobile', profile };
  void invalidRail;
  void invalidOverlay;
  void invalidMobile;
};

void typecheckPostComposerRelationships;
void typecheckPostComposerPresentations;

describe('PostComposer Reply context contract', () => {
  it('includes the concrete Parent only for Reply mutation input', async () => {
    const { createPostComposerMutationInput } = await import('./postComposerState');

    assert.deepEqual(createPostComposerMutationInput('일반 게시글', 'PUBLIC'), {
      bodyText: '일반 게시글',
      visibility: 'PUBLIC',
    });
    assert.deepEqual(
      createPostComposerMutationInput(
        '부모에게 보내는 답글',
        'FOLLOWERS',
        'post-parent',
        '스포일러',
      ),
      {
        bodyText: '부모에게 보내는 답글',
        contentWarning: '스포일러',
        replyParentId: 'post-parent',
        visibility: 'FOLLOWERS',
      },
    );
    assert.deepEqual(createPostComposerMutationInput('본문', 'UNLISTED', undefined, '   '), {
      bodyText: '본문',
      visibility: 'UNLISTED',
    });
    assert.deepEqual(
      createPostComposerMutationInput('인용 본문', 'PUBLIC', undefined, '경고', 'post-source'),
      {
        bodyText: '인용 본문',
        contentWarning: '경고',
        repostSourceId: 'post-source',
        visibility: 'PUBLIC',
      },
    );
    assert.deepEqual(
      createPostComposerMutationInput('본문 @alice', 'PUBLIC', undefined, undefined, undefined, [
        { profileId: 'profile-alice', start: 3, end: 9 },
      ]),
      {
        bodyText: '본문 @alice',
        mentions: [{ profileId: 'profile-alice', start: 3, end: 9 }],
        visibility: 'PUBLIC',
      },
    );
  });

  it('excludes DIRECT only while composing a Reply', async () => {
    const { isPostComposerVisibilityAllowed } = await import('./postComposerState');

    assert.equal(isPostComposerVisibilityAllowed('DIRECT'), true);
    assert.equal(isPostComposerVisibilityAllowed('DIRECT', 'post-parent'), false);
    for (const visibility of ['PUBLIC', 'UNLISTED', 'FOLLOWERS'] as const) {
      assert.equal(isPostComposerVisibilityAllowed(visibility, 'post-parent'), true);
    }
  });

  it('changes context identity when either selected Profile or Parent changes', async () => {
    const { createPostComposerContextKey } = await import('./postComposerState');

    assert.notEqual(
      createPostComposerContextKey('profile-a', 'post-parent'),
      createPostComposerContextKey('profile-b', 'post-parent'),
    );
    assert.notEqual(
      createPostComposerContextKey('profile-a', 'post-parent'),
      createPostComposerContextKey('profile-a', 'post-other'),
    );
    assert.notEqual(
      createPostComposerContextKey('profile-a'),
      createPostComposerContextKey('profile-a', 'post-parent'),
    );
    assert.notEqual(
      createPostComposerContextKey('profile-a', undefined, 'post-source'),
      createPostComposerContextKey('profile-a', undefined, 'post-other-source'),
    );
  });

  it('projects only supported Profile defaults and falls back to UNLISTED', async () => {
    const { resolvePostComposerVisibility } = await import('./postComposerState');

    assert.equal(resolvePostComposerVisibility('PUBLIC'), 'PUBLIC');
    assert.equal(resolvePostComposerVisibility('FOLLOWERS'), 'FOLLOWERS');
    assert.equal(resolvePostComposerVisibility('UNLISTED'), 'UNLISTED');
    assert.equal(resolvePostComposerVisibility('DIRECT'), 'UNLISTED');
    assert.equal(resolvePostComposerVisibility(null), 'UNLISTED');
  });

  it('shifts untouched repeated mention ranges and drops ranges changed by the edit', async () => {
    const { updatePostComposerMentionRanges } = await import('./postComposerState');
    const body = '😀 @one and @two';
    const ranges = [
      { profileId: 'profile-a', start: 3, end: 7 },
      { profileId: 'profile-a', start: 12, end: 16 },
    ];

    const prefixedBody = `x${body}`;
    const shifted = updatePostComposerMentionRanges(body, prefixedBody, ranges);
    assert.deepEqual(shifted, [
      { profileId: 'profile-a', start: 4, end: 8 },
      { profileId: 'profile-a', start: 13, end: 17 },
    ]);

    const editedBody = `${prefixedBody.slice(0, 5)}z${prefixedBody.slice(5)}`;
    assert.deepEqual(updatePostComposerMentionRanges(prefixedBody, editedBody, shifted), [
      { profileId: 'profile-a', start: 14, end: 18 },
    ]);
  });

  it('drops a selected identity when an edit joins either edge of its handle token', async () => {
    const { updatePostComposerMentionRanges } = await import('./postComposerState');
    const range = [{ profileId: 'profile-alice', start: 0, end: 6 }];

    assert.deepEqual(updatePostComposerMentionRanges('@alice', '@alicex', range), []);
    assert.deepEqual(updatePostComposerMentionRanges('@alice', 'ordinaryword@alice', range), []);
    assert.deepEqual(updatePostComposerMentionRanges('@alice', '', range), []);
    assert.deepEqual(updatePostComposerMentionRanges('@alice', '@alice!', range), range);
    assert.deepEqual(updatePostComposerMentionRanges('@alice', '@alice.', range), range);
    assert.deepEqual(updatePostComposerMentionRanges('@alice.', '@alice.x', range), []);
    assert.deepEqual(updatePostComposerMentionRanges('@alice', '@alice.x', range), []);
  });

  it('uses validated selection hints and drops only identities with ambiguous new offsets', async () => {
    const { updatePostComposerMentionRanges } = await import('./postComposerState');
    const alice = [{ profileId: 'profile-alice', start: 0, end: 6 }];

    assert.deepEqual(
      updatePostComposerMentionRanges('@alice', '@alice. ', alice, [{ start: 6, end: 6 }]),
      alice,
    );
    assert.deepEqual(
      updatePostComposerMentionRanges('@alice.', '@alice.x', alice, [{ start: 7, end: 7 }]),
      [],
    );

    const body = '@a @a';
    const nextBody = '@a @a @a';
    assert.deepEqual(
      updatePostComposerMentionRanges(
        body,
        nextBody,
        [
          { profileId: 'first', start: 0, end: 2 },
          { profileId: 'second', start: 3, end: 5 },
        ],
        [
          { start: 0, end: 0 },
          { start: 3, end: 3 },
        ],
      ),
      [{ profileId: 'second', start: 6, end: 8 }],
    );
  });

  it('uses the canonical changed span for a replacement without selection hints', async () => {
    const { updatePostComposerMentionRanges } = await import('./postComposerState');

    assert.deepEqual(
      updatePostComposerMentionRanges('@alice', '@axice', [
        { profileId: 'profile-alice', start: 0, end: 6 },
      ]),
      [],
    );
  });

  it('does not transfer an identity to a remaining duplicate after deletion', async () => {
    const {
      normalizePostComposerMentionDraft,
      updatePostComposerDraftBody,
      updatePostComposerMentionRanges,
    } = await import('./postComposerState');
    const mentionRanges = [{ profileId: 'profile-alice', start: 0, end: 6 }];
    const duplicateBody = '@alice @alice';

    const selectedDeletion = updatePostComposerDraftBody(
      {
        body: duplicateBody,
        mentionRanges,
        previousSelection: { start: 0, end: 6 },
        selection: { start: 0, end: 0 },
      },
      ' @alice',
    );
    assert.deepEqual(selectedDeletion.mentionRanges, []);
    assert.deepEqual(
      normalizePostComposerMentionDraft(selectedDeletion.body, selectedDeletion.mentionRanges),
      {
        bodyText: '@alice',
        mentions: [],
      },
    );

    const collapsedBackspace = updatePostComposerDraftBody(
      {
        body: duplicateBody,
        mentionRanges,
        previousSelection: { start: 6, end: 6 },
        selection: { start: 6, end: 6 },
      },
      '@alic @alice',
    );
    assert.deepEqual(collapsedBackspace.mentionRanges, []);
    assert.deepEqual(
      normalizePostComposerMentionDraft(collapsedBackspace.body, collapsedBackspace.mentionRanges),
      { bodyText: '@alic @alice', mentions: [] },
    );

    assert.deepEqual(
      updatePostComposerMentionRanges(duplicateBody, '@alice', mentionRanges, [
        { start: duplicateBody.length + 1, end: duplicateBody.length + 1 },
      ]),
      [],
    );

    const repeatedMentions = [
      { profileId: 'first-alice', start: 0, end: 6 },
      { profileId: 'second-alice', start: 7, end: 13 },
    ];
    const withTailEdit = `${duplicateBody} draft`;
    assert.deepEqual(
      updatePostComposerMentionRanges(withTailEdit, `${withTailEdit}!`, repeatedMentions, [
        { start: withTailEdit.length + 1, end: withTailEdit.length + 1 },
      ]),
      repeatedMentions,
    );
  });

  it('finds a token-boundary mention query at the editor caret', async () => {
    const { findPostComposerMentionQuery } = await import('./postComposerState');

    assert.deepEqual(findPostComposerMentionQuery('topic @al', 9, 9), {
      end: 9,
      query: 'al',
      start: 6,
    });
    assert.deepEqual(findPostComposerMentionQuery('@', 1, 1), {
      end: 1,
      query: '',
      start: 0,
    });
    assert.deepEqual(findPostComposerMentionQuery('@alice@domain', 13, 13), {
      end: 13,
      query: 'alice@domain',
      start: 0,
    });
    assert.equal(findPostComposerMentionQuery('word@alice', 10, 10), null);
    assert.equal(findPostComposerMentionQuery('@alice', 3, 5), null);
    assert.deepEqual(findPostComposerMentionQuery('Hi (@al), rest', 7, 7), {
      end: 7,
      query: 'al',
      start: 4,
    });
    assert.equal(findPostComposerMentionQuery('𐐀@', 3, 3), null);
  });

  it('replaces only a current nonempty query and returns the selected Profile range', async () => {
    const { findPostComposerMentionQuery, replacePostComposerMentionQuery } =
      await import('./postComposerState');
    const candidate = { id: 'profile-alice', relativeHandle: '@alice' };
    const query = { end: 11, query: 'ali', start: 7 };

    assert.deepEqual(replacePostComposerMentionQuery('prefix @ali', query, candidate), {
      body: 'prefix @alice ',
      range: { profileId: 'profile-alice', start: 7, end: 13 },
    });
    assert.equal(replacePostComposerMentionQuery('prefix @bob', query, candidate), null);
    assert.equal(
      replacePostComposerMentionQuery('prefix @', { ...query, query: '' }, candidate),
      null,
    );

    const punctuationQuery = findPostComposerMentionQuery('Hi (@al), rest', 7, 7);
    assert.ok(punctuationQuery);
    assert.equal(
      replacePostComposerMentionQuery('Hi (@al), rest', punctuationQuery, candidate)?.body,
      'Hi (@alice ), rest',
    );
  });

  it('preserves separate repeated occurrences of the same Profile identity', async () => {
    const { normalizePostComposerMentionDraft } = await import('./postComposerState');

    assert.deepEqual(
      normalizePostComposerMentionDraft('@alice @alice', [
        { profileId: 'profile-alice', start: 0, end: 6 },
        { profileId: 'profile-alice', start: 7, end: 13 },
      ]),
      {
        bodyText: '@alice @alice',
        mentions: [
          { profileId: 'profile-alice', start: 0, end: 6 },
          { profileId: 'profile-alice', start: 7, end: 13 },
        ],
      },
    );
  });

  it('normalizes line endings and trimming while remapping UTF-16 mention offsets', async () => {
    const { normalizePostComposerMentionDraft } = await import('./postComposerState');

    assert.deepEqual(
      normalizePostComposerMentionDraft(' \r\n😀 @alice\r\n', [
        { profileId: 'profile-alice', start: 6, end: 12 },
      ]),
      {
        bodyText: '😀 @alice',
        mentions: [{ profileId: 'profile-alice', start: 3, end: 9 }],
      },
    );
    assert.deepEqual(
      normalizePostComposerMentionDraft(' \r\n😀\r@alice\r\n', [
        { profileId: 'profile-alice', start: 6, end: 12 },
        { profileId: 'invalid', start: 6.5, end: 8 },
        { profileId: 'empty', start: 6, end: 6 },
      ]),
      {
        bodyText: '😀\n@alice',
        mentions: [{ profileId: 'profile-alice', start: 3, end: 9 }],
      },
    );
    assert.deepEqual(normalizePostComposerMentionDraft('@alice', []), {
      bodyText: '@alice',
      mentions: [],
    });
  });
});
