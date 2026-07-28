export type ProfileEditImageDraft =
  | { kind: 'current'; previewUri: string | null }
  | {
      kind: 'replacement';
      previewUri: string | null;
      uploadState: 'ready' | 'uploading' | 'error';
      error?: string;
    }
  | { kind: 'removed'; previewUri: null };

export type ProfileEditDraft = {
  avatar: ProfileEditImageDraft;
  bio: string;
  displayName: string;
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

export type ProfileTagMoveDirection = -1 | 1;

export type CanSubmitProfileEditOptions = {
  initialValue: ProfileEditDraft;
  value: ProfileEditDraft;
  errors: ProfileEditFieldErrors;
  onSubmit?: ((value: ProfileEditDraft) => unknown) | null;
  submitState: ProfileEditSubmitState;
};

const MAX_DISPLAY_NAME_CODE_POINTS = 40;
const MAX_BIO_CODE_POINTS = 500;
const MAX_PROFILE_TAG_CODE_POINTS = 20;
const MAX_PROFILE_TAGS = 5;

function countCodePoints(value: string): number {
  return [...value].length;
}

export function validateProfileEditDraft(value: ProfileEditDraft): ProfileEditFieldErrors {
  const errors: ProfileEditFieldErrors = {};
  const displayNameLength = countCodePoints(value.displayName.trim());

  if (displayNameLength === 0) {
    errors.displayName = '표시 이름을 입력해 주세요.';
  } else if (displayNameLength > MAX_DISPLAY_NAME_CODE_POINTS) {
    errors.displayName = '표시 이름은 40자 이하로 입력해 주세요.';
  }

  if (countCodePoints(value.bio) > MAX_BIO_CODE_POINTS) {
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
    initial.displayName !== value.displayName ||
    initial.bio !== value.bio ||
    !areProfileEditImagesEqual(initial.avatar, value.avatar) ||
    !areProfileEditImagesEqual(initial.header, value.header) ||
    initial.tags.length !== value.tags.length
  ) {
    return true;
  }

  return initial.tags.some((tag, index) => tag !== value.tags[index]);
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

/** Client-only preview normalization; the server remains authoritative for final tag identity. */
function normalizeProfileTagPreview(input: string): string {
  const trimmed = input.trim();
  const withoutOptionalHash = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  return withoutOptionalHash.normalize('NFKC').toLowerCase();
}

export function validateProfileTagDraftInput(
  input: string,
  tags: ReadonlyArray<string>,
): ProfileTagValidationResult {
  const normalized = normalizeProfileTagPreview(input);

  if (normalized.length === 0) {
    return { ok: false, error: '태그를 입력해 주세요.' };
  }

  if (!/^[\p{L}\p{N}_]+$/u.test(normalized)) {
    return { ok: false, error: '태그는 문자, 숫자, 밑줄만 사용할 수 있어요.' };
  }

  if (countCodePoints(normalized) > MAX_PROFILE_TAG_CODE_POINTS) {
    return { ok: false, error: '태그는 20자 이하로 입력해 주세요.' };
  }

  if (tags.some((tag) => normalizeProfileTagPreview(tag) === normalized)) {
    return { ok: false, error: '이미 추가한 태그예요.' };
  }

  if (tags.length >= MAX_PROFILE_TAGS) {
    return { ok: false, error: '프로필 태그는 최대 5개까지 추가할 수 있어요.' };
  }

  return { ok: true, value: normalized };
}

export function moveProfileTag(
  tags: ReadonlyArray<string>,
  index: number,
  direction: ProfileTagMoveDirection,
): string[] {
  return moveProfileTagToIndex(tags, index, index + direction);
}

export function moveProfileTagToIndex(
  tags: ReadonlyArray<string>,
  fromIndex: number,
  toIndex: number,
): string[] {
  const next = [...tags];

  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    fromIndex >= next.length ||
    toIndex < 0 ||
    toIndex >= next.length ||
    fromIndex === toIndex
  ) {
    return next;
  }

  const [tag] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, tag);
  return next;
}
