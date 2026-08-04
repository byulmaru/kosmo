import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

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
  });
});
