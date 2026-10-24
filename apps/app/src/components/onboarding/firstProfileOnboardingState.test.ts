import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  initialFirstProfileDraft,
  prepareFirstProfileDraft,
  prepareFirstProfileStep,
} from './firstProfileOnboardingState';

describe('first profile draft', () => {
  it('prepares empty optional inputs with Public/Open defaults', () => {
    const result = prepareFirstProfileDraft({ ...initialFirstProfileDraft, handle: 'spring' });
    assert.deepEqual(result, {
      ok: true,
      value: {
        handle: 'spring',
        displayName: 'spring',
        bio: null,
        tags: [],
        defaultPostVisibility: 'PUBLIC',
        followPolicy: 'OPEN',
      },
    });
  });

  it('saves Public/Open when the posting step keeps its initial selection', () => {
    assert.deepEqual(
      prepareFirstProfileStep({ ...initialFirstProfileDraft, handle: 'spring' }, 'posting'),
      {
        ok: true,
        value: { defaultPostVisibility: 'PUBLIC', followPolicy: 'OPEN' },
      },
    );
  });

  it('keeps the existing handle format and reserved-name policy', () => {
    for (const handle of ['', 'ab', 'admin', '한글핸들', 'a'.repeat(31)]) {
      const result = prepareFirstProfileDraft({ ...initialFirstProfileDraft, handle });
      assert.equal(result.ok, false, handle);
      if (!result.ok) {
        assert.ok(result.errors.handle);
      }
    }
    assert.equal(
      prepareFirstProfileDraft({ ...initialFirstProfileDraft, handle: 'spring_1' }).ok,
      true,
    );
  });

  it('validates entered optional values and includes the uncommitted tag input', () => {
    const result = prepareFirstProfileDraft({
      ...initialFirstProfileDraft,
      handle: 'spring',
      displayName: '🌼'.repeat(40),
      bio: '  안녕하세요  ',
      tags: ['책'],
      tagInput: '#애니메이션',
      defaultPostVisibility: 'FOLLOWERS',
      followPolicy: 'APPROVAL_REQUIRED',
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.displayName, '🌼'.repeat(40));
      assert.equal(result.value.bio, '안녕하세요');
      assert.deepEqual(result.value.tags, ['책', '애니메이션']);
      assert.equal(result.value.defaultPostVisibility, 'FOLLOWERS');
      assert.equal(result.value.followPolicy, 'APPROVAL_REQUIRED');
    }
    for (const input of [
      { displayName: '🌼'.repeat(41) },
      { bio: '가'.repeat(501) },
      { tagInput: 'bad tag' },
    ]) {
      const invalid = prepareFirstProfileDraft({
        ...initialFirstProfileDraft,
        handle: 'spring',
        ...input,
      });
      assert.equal(invalid.ok, false);
    }
  });

  it('rejects a duplicate tag after canonical normalization', () => {
    const result = prepareFirstProfileDraft({
      ...initialFirstProfileDraft,
      handle: 'spring',
      tags: ['KOSMO'],
      tagInput: '#kosmo',
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.tags);
    }
  });

  it('validates and prepares only the optional step being saved', () => {
    const draft = {
      ...initialFirstProfileDraft,
      handle: 'spring',
      displayName: '  봄  ',
      bio: '  소개  ',
      tagInput: 'bad tag',
      defaultPostVisibility: 'FOLLOWERS' as const,
      followPolicy: 'APPROVAL_REQUIRED' as const,
    };
    assert.deepEqual(prepareFirstProfileStep(draft, 'details'), {
      ok: true,
      value: { displayName: '봄', bio: '소개' },
    });
    assert.equal(prepareFirstProfileStep(draft, 'tags').ok, false);
    assert.deepEqual(prepareFirstProfileStep(draft, 'posting'), {
      ok: true,
      value: { defaultPostVisibility: 'FOLLOWERS', followPolicy: 'APPROVAL_REQUIRED' },
    });
  });

  it('keeps defaults for empty details and commits the pending tag only in the tag step', () => {
    const draft = {
      ...initialFirstProfileDraft,
      handle: 'spring',
      tags: ['책'],
      tagInput: '#애니메이션',
    };
    assert.deepEqual(prepareFirstProfileStep(draft, 'details'), {
      ok: true,
      value: { displayName: 'spring', bio: null },
    });
    assert.deepEqual(prepareFirstProfileStep(draft, 'tags'), {
      ok: true,
      value: { tags: ['책', '애니메이션'] },
    });
  });
});
