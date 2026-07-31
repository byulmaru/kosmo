const correlationPattern = /^prod613-[a-z0-9-]+$/;

export function profileEditCorrelationId(headers: Headers): string | null {
  const value = headers.get('x-kosmo-correlation-id');
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

export function observeProfileEditBody(
  response: Response,
  correlationId: string | null,
  endStage: string,
): Response {
  if (!correlationId || !response.body) {
    traceProfileEditBoundary(correlationId, endStage);
    return new Response(response.body, response);
  }

  const body = response.body.pipeThrough(
    new TransformStream({
      flush() {
        traceProfileEditBoundary(correlationId, endStage);
      },
    }),
  );

  return new Response(body, response);
}
