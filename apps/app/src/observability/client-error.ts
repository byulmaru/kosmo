export type ClientErrorOrigin = 'graphql-response' | 'transport' | 'local-render';
export type ClientErrorType = 'graphql' | 'network' | 'render';

export type ClientErrorClassification = Readonly<{
  code: string;
  origin: ClientErrorOrigin;
  type: ClientErrorType;
}>;

export class StructuredClientError extends Error {
  readonly code: string;
  readonly origin: ClientErrorOrigin;
  readonly type: ClientErrorType;
  readonly cause: unknown;

  constructor({
    cause,
    code,
    message,
    origin,
    type,
  }: ClientErrorClassification & { cause?: unknown; message: string }) {
    super(message);
    this.name = 'StructuredClientError';
    this.cause = cause;
    this.code = code;
    this.origin = origin;
    this.type = type;
  }
}

export function classifyClientError(error: unknown): ClientErrorClassification {
  if (error instanceof StructuredClientError) {
    return { code: error.code, origin: error.origin, type: error.type };
  }

  const source = getRecord(getRecord(error)?.source);
  if (source && 'operation' in source) {
    const errors = Array.isArray(source.errors) ? source.errors : [];
    const code = errors
      .map(getGraphQLErrorCode)
      .find((value: string | null): value is string => value !== null);

    return {
      code: code ?? 'GRAPHQL_RESPONSE_ERROR',
      origin: 'graphql-response',
      type: 'graphql',
    };
  }

  return { code: 'UNEXPECTED_RENDER_ERROR', origin: 'local-render', type: 'render' };
}

export function isExpectedClientError(error: unknown): boolean {
  return classifyClientError(error).origin !== 'local-render';
}

export function getGraphQLErrorCode(error: unknown): string | null {
  const extensions = getRecord(error)?.extensions;
  const code = getRecord(extensions)?.code;
  return typeof code === 'string' ? code : null;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}
