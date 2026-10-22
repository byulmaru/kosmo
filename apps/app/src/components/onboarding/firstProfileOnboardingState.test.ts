import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  defaultFirstProfileValues,
  firstProfileChanges,
  initialFirstProfileDraft,
  prepareFirstProfileDraft,
} from './firstProfileOnboardingState';

describe('first profile draft', () => {
  it('starts with empty optional inputs and Unlisted/Open defaults', () => {
    const result = prepareFirstProfileDraft({ ...initialFirstProfileDraft, handle: 'spring' });
    assert.deepEqual(result, {
      ok: true,
      value: {
        handle: 'spring',
        displayName: 'spring',
        bio: null,
        tags: [],
        defaultPostVisibility: 'UNLISTED',
        followPolicy: 'OPEN',
      },
    });
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

  it('does not save unchanged values and treats tag order as unordered', () => {
    const baseline = { ...defaultFirstProfileValues('spring'), tags: ['책', '애니메이션'] };
    assert.equal(firstProfileChanges({ ...baseline, tags: ['애니메이션', '책'] }, baseline), null);
  });

  it('sends changed fields and explicit image removal only', () => {
    const baseline = { ...defaultFirstProfileValues('spring'), avatarId: 'media-avatar' };
    assert.deepEqual(
      firstProfileChanges(
        { ...baseline, avatarId: null, bio: '소개', followPolicy: 'APPROVAL_REQUIRED' },
        baseline,
      ),
      {
        avatarId: null,
        bio: '소개',
        followPolicy: 'APPROVAL_REQUIRED',
      },
    );
  });
});
