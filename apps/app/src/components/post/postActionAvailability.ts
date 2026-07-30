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
