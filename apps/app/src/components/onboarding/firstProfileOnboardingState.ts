import {
  localProfileHandleSchema,
  profileBioSchema,
  profileTagsSchema,
} from '@kosmo/core/validation';
import type { ProfilePostingSettingsValue } from '@/components/settings/ProfilePostingSettings';

export const firstProfileSteps = ['handle', 'details', 'tags', 'posting', 'review'] as const;
export type FirstProfileStep = (typeof firstProfileSteps)[number];
export type FirstProfileDraft = ProfilePostingSettingsValue & {
  handle: string;
  displayName: string;
  bio: string;
  tags: ReadonlyArray<string>;
  tagInput: string;
};
export type FirstProfileErrors = Partial<Record<'handle' | 'displayName' | 'bio' | 'tags', string>>;
export type FirstProfileValues = ProfilePostingSettingsValue & {
  displayName: string;
  bio: string | null;
  tags: ReadonlyArray<string>;
  avatarId: string | null;
  headerId: string | null;
};

export const initialFirstProfileDraft: FirstProfileDraft = {
  handle: '',
  displayName: '',
  bio: '',
  tags: [],
  tagInput: '',
  defaultPostVisibility: 'UNLISTED',
  followPolicy: 'OPEN',
};

export function defaultFirstProfileValues(handle: string): FirstProfileValues {
  return {
    displayName: handle,
    bio: null,
    tags: [],
    defaultPostVisibility: 'UNLISTED',
    followPolicy: 'OPEN',
    avatarId: null,
    headerId: null,
  };
}

export function prepareFirstProfileDraft(
  draft: FirstProfileDraft,
):
  | { ok: true; value: Omit<FirstProfileValues, 'avatarId' | 'headerId'> & { handle: string } }
  | { ok: false; errors: FirstProfileErrors } {
  const errors: FirstProfileErrors = {};
  const handle = localProfileHandleSchema.safeParse(draft.handle);
  if (!handle.success) {
    errors.handle = handle.error.issues[0]?.message ?? '핸들을 확인해 주세요.';
  }
  if ([...draft.displayName.trim()].length > 40) {
    errors.displayName = '표시 이름은 40자 이하로 입력해 주세요.';
  }
  const bio = profileBioSchema.safeParse(draft.bio);
  if (!bio.success) {
    errors.bio = '소개는 500자 이하로 입력해 주세요.';
  }
  const tags = profileTagsSchema.safeParse([
    ...draft.tags,
    ...(draft.tagInput.trim() ? [draft.tagInput] : []),
  ]);
  if (!tags.success) {
    errors.tags = tags.error.issues[0]?.message ?? '프로필 태그를 확인해 주세요.';
  }
  if (!handle.success || !bio.success || !tags.success || Object.keys(errors).length) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      handle: handle.data,
      displayName: draft.displayName.trim() || handle.data,
      bio: bio.data || null,
      tags: tags.data.map((tag) => tag.displayName),
      defaultPostVisibility: draft.defaultPostVisibility,
      followPolicy: draft.followPolicy,
    },
  };
}

export function firstProfileChanges(
  value: FirstProfileValues,
  baseline: FirstProfileValues,
): Partial<FirstProfileValues> | null {
  const changes: Partial<FirstProfileValues> = {};
  if (value.displayName !== baseline.displayName) {
    changes.displayName = value.displayName;
  }
  if (value.bio !== baseline.bio) {
    changes.bio = value.bio;
  }
  if (value.defaultPostVisibility !== baseline.defaultPostVisibility) {
    changes.defaultPostVisibility = value.defaultPostVisibility;
  }
  if (value.followPolicy !== baseline.followPolicy) {
    changes.followPolicy = value.followPolicy;
  }
  if (JSON.stringify([...value.tags].sort()) !== JSON.stringify([...baseline.tags].sort())) {
    changes.tags = [...value.tags];
  }
  if (value.avatarId !== baseline.avatarId) {
    changes.avatarId = value.avatarId;
  }
  if (value.headerId !== baseline.headerId) {
    changes.headerId = value.headerId;
  }
  return Object.keys(changes).length ? changes : null;
}
