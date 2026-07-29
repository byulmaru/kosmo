import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canSubmitProfileEdit,
  isProfileEditDraftDirty,
  validateProfileEditDraft,
  validateProfileTagDraftInput,
} from './profileEditState';
import type { ProfileEditDraft } from './profileEditState';

const draft: ProfileEditDraft = {
  avatar: { kind: 'current', previewUri: 'avatar://current' },
  bio: '안녕하세요',
  displayName: '코스모',
  followPolicy: 'OPEN',
  header: { kind: 'current', previewUri: 'header://current' },
  tags: ['공예', '개발'],
};

const replacementHeader: ProfileEditDraft['header'] = {
  kind: 'replacement',
  previewUri: 'header://replacement',
  uploadState: 'ready',
};

test('displayName과 bio를 Unicode code point 기준으로 검증한다', () => {
  assert.equal(
    validateProfileEditDraft({ ...draft, displayName: '   ' }).displayName,
    '표시 이름을 입력해 주세요.',
  );
  assert.equal(
    validateProfileEditDraft({ ...draft, displayName: '가'.repeat(41) }).displayName,
    '표시 이름은 40자 이하로 입력해 주세요.',
  );
  assert.equal(
    validateProfileEditDraft({ ...draft, bio: '가'.repeat(501) }).bio,
    '한 줄 소개는 500자 이하로 입력해 주세요.',
  );
  assert.equal(
    validateProfileEditDraft({ ...draft, displayName: '😀'.repeat(40) }).displayName,
    undefined,
  );
  assert.equal(
    validateProfileEditDraft({ ...draft, displayName: '😀'.repeat(41) }).displayName,
    '표시 이름은 40자 이하로 입력해 주세요.',
  );
});

test('Profile Tag 입력을 client preview 규칙으로 정규화하고 검증한다', () => {
  assert.deepEqual(validateProfileTagDraftInput('  #Ａrt_1  ', []), { ok: true, value: 'art_1' });
  assert.equal(validateProfileTagDraftInput('#art', ['art']).ok, false);
  assert.equal(validateProfileTagDraftInput('공예!', []).ok, false);
  assert.equal(validateProfileTagDraftInput('가'.repeat(21), []).ok, false);
  assert.deepEqual(validateProfileTagDraftInput('추가', ['a', 'b', 'c', 'd', 'e']), {
    ok: true,
    value: '추가',
  });
});

test('draft dirty 비교는 이미지와 Tag identity 집합을 포함한다', () => {
  assert.equal(isProfileEditDraftDirty(draft, draft), false);
  assert.equal(isProfileEditDraftDirty(draft, { ...draft, bio: '변경' }), true);
  assert.equal(isProfileEditDraftDirty(draft, { ...draft, header: replacementHeader }), true);
  assert.equal(isProfileEditDraftDirty(draft, { ...draft, avatar: draft.avatar }), false);
  assert.equal(isProfileEditDraftDirty(draft, { ...draft, tags: ['개발', '공예'] }), false);
  assert.equal(isProfileEditDraftDirty(draft, { ...draft, tags: ['공예', '사진'] }), true);
  assert.equal(
    isProfileEditDraftDirty(draft, { ...draft, followPolicy: 'APPROVAL_REQUIRED' }),
    true,
  );
});

test('submit gate는 callback, dirty, errors, upload과 saving 상태를 모두 확인한다', () => {
  const onSubmit = () => undefined;
  const base = {
    initialValue: draft,
    value: { ...draft, bio: '변경' },
    errors: {},
    onSubmit,
    submitState: { kind: 'idle' as const },
  };

  assert.equal(canSubmitProfileEdit({ ...base, onSubmit: undefined }), false);
  assert.equal(canSubmitProfileEdit({ ...base, value: draft }), false);
  assert.equal(canSubmitProfileEdit({ ...base, errors: { bio: '오류' } }), false);
  assert.equal(
    canSubmitProfileEdit({
      ...base,
      value: {
        ...base.value,
        avatar: { kind: 'replacement', previewUri: 'avatar://uploading', uploadState: 'uploading' },
      },
    }),
    false,
  );
  assert.equal(
    canSubmitProfileEdit({
      ...base,
      value: {
        ...base.value,
        avatar: {
          kind: 'replacement',
          previewUri: 'avatar://error',
          uploadState: 'error',
          error: '실패',
        },
      },
    }),
    false,
  );
  assert.equal(canSubmitProfileEdit({ ...base, submitState: { kind: 'saving' } }), false);
  assert.equal(canSubmitProfileEdit(base), true);
});
