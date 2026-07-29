import {
  normalizeProfileTagDisplayName,
  normalizeProfileTagName,
  profileBioSchema,
  profileTagNameSchema,
} from '@kosmo/core/validation';

export type ProfileEditImageDraft =
  | { kind: 'current'; previewUri: string | null }
  | {
      kind: 'replacement';
      previewUri: string | null;
      uploadState: 'ready' | 'uploading' | 'error';
      error?: string;
    }
  | { kind: 'removed'; previewUri: null };

export type ProfileFollowPolicy = 'OPEN' | 'APPROVAL_REQUIRED';

export type ProfileEditDraft = {
  avatar: ProfileEditImageDraft;
  bio: string;
  displayName: string;
  followPolicy: ProfileFollowPolicy;
  header: ProfileEditImageDraft;
  tags: ReadonlyArray<string>;
};

export type ProfileEditSubmitState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'error'; message: string };

export type ProfileEditFieldErrors = {
  displayName?: string;
  bio?: string;
  tags?: string;
  avatar?: string;
  header?: string;
};

export type ProfileTagValidationResult = { ok: true; value: string } | { ok: false; error: string };

export type CanSubmitProfileEditOptions = {
  initialValue: ProfileEditDraft;
  value: ProfileEditDraft;
  errors: ProfileEditFieldErrors;
  onSubmit?: ((value: ProfileEditDraft) => unknown) | null;
  submitState: ProfileEditSubmitState;
};

const MAX_DISPLAY_NAME_CODE_POINTS = 40;

function countCodePoints(value: string): number {
  return [...value].length;
}

export function validateProfileEditDraft(
  value: ProfileEditDraft,
  initialValue?: ProfileEditDraft,
): ProfileEditFieldErrors {
  const errors: ProfileEditFieldErrors = {};
  const displayNameLength = countCodePoints(value.displayName.trim());

  if (displayNameLength === 0) {
    errors.displayName = '표시 이름을 입력해 주세요.';
  } else if (
    displayNameLength > MAX_DISPLAY_NAME_CODE_POINTS &&
    value.displayName !== initialValue?.displayName
  ) {
    errors.displayName = '표시 이름은 40자 이하로 입력해 주세요.';
  }

  if (!profileBioSchema.safeParse(value.bio).success) {
    errors.bio = '한 줄 소개는 500자 이하로 입력해 주세요.';
  }

  return errors;
}

function areProfileEditImagesEqual(
  initial: ProfileEditImageDraft,
  value: ProfileEditImageDraft,
): boolean {
  if (initial.kind !== value.kind || initial.previewUri !== value.previewUri) {
    return false;
  }

  if (initial.kind === 'replacement' && value.kind === 'replacement') {
    return initial.uploadState === value.uploadState && initial.error === value.error;
  }

  return true;
}

export function isProfileEditDraftDirty(
  initial: ProfileEditDraft,
  value: ProfileEditDraft,
): boolean {
  if (
    initial.followPolicy !== value.followPolicy ||
    initial.displayName !== value.displayName ||
    initial.bio !== value.bio ||
    !areProfileEditImagesEqual(initial.avatar, value.avatar) ||
    !areProfileEditImagesEqual(initial.header, value.header) ||
    initial.tags.length !== value.tags.length
  ) {
    return true;
  }

  const initialTags = new Set(initial.tags);
  return value.tags.some((tag) => !initialTags.has(tag));
}

function areReplacementUploadsReady(image: ProfileEditImageDraft): boolean {
  return image.kind !== 'replacement' || image.uploadState === 'ready';
}

export function canSubmitProfileEdit({
  initialValue,
  value,
  errors,
  onSubmit,
  submitState,
}: CanSubmitProfileEditOptions): boolean {
  if (
    !onSubmit ||
    !isProfileEditDraftDirty(initialValue, value) ||
    Object.values(errors).some((error) => error !== undefined) ||
    !areReplacementUploadsReady(value.avatar) ||
    !areReplacementUploadsReady(value.header) ||
    submitState.kind === 'saving'
  ) {
    return false;
  }

  return true;
}

export function validateProfileTagDraftInput(
  input: string,
  tags: ReadonlyArray<string>,
): ProfileTagValidationResult {
  const result = profileTagNameSchema.safeParse(input);

  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues[0]?.message ?? 'Profile Tag를 확인해 주세요.',
    };
  }

  if (tags.some((tag) => normalizeProfileTagName(tag) === result.data)) {
    return { ok: false, error: '이미 추가한 태그예요.' };
  }

  return { ok: true, value: normalizeProfileTagDisplayName(input) };
}
