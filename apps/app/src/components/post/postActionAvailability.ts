export type PostActionExecution =
  | Readonly<{ kind: 'enabled' }>
  | Readonly<{ kind: 'resolution-required'; reason: 'guest' | 'profile' }>
  | Readonly<{ kind: 'disabled'; reason: 'session-error' | 'target' }>;

export type PostActionResolutionReason = Extract<
  PostActionExecution,
  { kind: 'resolution-required' }
>['reason'];

type PostActionAvailabilityInput = Readonly<{
  selectedProfileId: string | null;
  status: 'error' | 'guest' | 'valid';
  targetEligible: boolean;
}>;

type RepostTargetEligibilityInput = Readonly<{
  authorProfileId: string;
  selectedProfileId: string | null;
  visibility: string;
}>;

type QuoteTargetEligibilityInput = RepostTargetEligibilityInput &
  Readonly<{ hasContent: boolean; sourceInstanceKind: string }>;

export function isRepostTargetEligible({
  authorProfileId,
  selectedProfileId,
  visibility,
}: RepostTargetEligibilityInput): boolean {
  if (visibility === 'PUBLIC' || visibility === 'UNLISTED') {
    return true;
  }
  if (visibility === 'FOLLOWERS') {
    return selectedProfileId === null || selectedProfileId === authorProfileId;
  }
  return false;
}

export function isQuoteTargetEligible({
  hasContent,
  authorProfileId,
  selectedProfileId,
  sourceInstanceKind,
  visibility,
}: QuoteTargetEligibilityInput): boolean {
  return (
    sourceInstanceKind === 'LOCAL' &&
    hasContent &&
    isRepostTargetEligible({ authorProfileId, selectedProfileId, visibility })
  );
}

export function resolvePostActionExecution({
  selectedProfileId,
  status,
  targetEligible,
}: PostActionAvailabilityInput): PostActionExecution {
  if (!targetEligible) {
    return { kind: 'disabled', reason: 'target' };
  }
  if (status === 'guest') {
    return { kind: 'resolution-required', reason: 'guest' };
  }
  if (status === 'error') {
    return { kind: 'disabled', reason: 'session-error' };
  }
  if (selectedProfileId === null) {
    return { kind: 'resolution-required', reason: 'profile' };
  }
  return { kind: 'enabled' };
}
