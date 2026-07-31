const operationName = 'ProfileEditRouteUpdateProfileMutation';
const scope = 'profile-edit-save';

let activeCorrelationId: string | null = null;

export function beginProfileEditDiagnostic(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  activeCorrelationId = `prod613-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  traceProfileEditDiagnostic(activeCorrelationId, 'browser-submit');
  return activeCorrelationId;
}

export function getProfileEditCorrelationId(requestName?: string): string | null {
  return requestName === undefined || requestName === operationName ? activeCorrelationId : null;
}

export function traceProfileEditDiagnostic(
  correlationId: string | null,
  stage: string,
  details: Record<string, unknown> = {},
) {
  if (!correlationId) {
    return;
  }

  console.info(
    JSON.stringify({
      correlationId,
      scope,
      stage,
      timestamp: Date.now(),
      ...details,
    }),
  );
}
