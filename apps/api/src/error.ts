import { GraphQLError } from 'graphql';

export class TypedError extends Error {
  code: string;
  args?: Record<string, string>;

  constructor(code: string, args?: Record<string, string>) {
    super(code, args);
    this.code = code;
    this.args = args;
  }
}

type FieldErrorParams = {
  path?: string | null;
  code: string;
};

export class FieldError extends TypedError {
  path: string | null;

  constructor({ path, code }: FieldErrorParams) {
    super(code);
    this.path = path ?? null;
  }
}

export class ValidationError extends FieldError {
  constructor({ path, code }: FieldErrorParams) {
    super({ path, code });
  }
}

export class NotFoundError extends TypedError {
  constructor({ code = 'error.common.notFound' }: { code?: string } = {}) {
    super(code);
  }
}

export class UnauthorizedError extends GraphQLError {
  constructor() {
    super('Unauthorized', {
      extensions: { type: 'UnauthorizedError', code: 'UNAUTHORIZED', status: 401 },
    });
  }
}

export class ForbiddenError extends TypedError {
  constructor({ code = 'error.common.forbidden' }: { code?: string } = {}) {
    super(code);
  }
}

type LimitExceededErrorParams = {
  object: string;
  limit: number;
  code?: string;
};

export class LimitExceededError extends TypedError {
  object: string;
  limit: number;

  constructor({ object, limit, code = 'error.common.limitExceeded' }: LimitExceededErrorParams) {
    super(code);
    this.object = object;
    this.limit = limit;
  }
}

export class ConflictError extends FieldError {
  constructor({ path, code = 'error.common.conflict' }: FieldErrorParams) {
    super({ path, code });
  }
}
