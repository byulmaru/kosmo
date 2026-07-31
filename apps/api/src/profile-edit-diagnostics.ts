import type { UserContext } from './context';

const correlationPattern = /^prod613-[a-z0-9-]+$/;

export function profileEditCorrelationId(ctx: UserContext): string | null {
  const value = ctx.c.req.header('x-kosmo-correlation-id');
  return value && correlationPattern.test(value) ? value : null;
}

export function traceProfileEditBoundary(
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
      scope: 'profile-edit-save',
      stage,
      timestamp: Date.now(),
      ...details,
    }),
  );
}
