import { GraphQLError } from 'graphql';

type FieldErrorParams = {
  path?: string | null;
  message: string;
};

export class FieldError extends Error {
  path: string | null;

  constructor({ path, message }: FieldErrorParams) {
    super(message);
    this.path = path ?? null;
  }
}

export class ValidationError extends FieldError {
  constructor({ path, message }: FieldErrorParams) {
    super({ path, message });
  }
}

export class NotFoundError extends Error {
  constructor({ message = 'error.common.notFound' }: { message?: string } = {}) {
    super(message);
  }
}

export class UnauthorizedError extends GraphQLError {
  constructor() {
    super('Unauthorized', {
      extensions: { type: 'UnauthorizedError', code: 'UNAUTHORIZED', status: 401 },
    });
  }
}

export class ForbiddenError extends Error {
  constructor({ message = 'error.common.forbidden' }: { message?: string } = {}) {
    super(message);
  }
}

type LimitExceededErrorParams = {
  object: string;
  limit: number;
  message?: string;
};

export class LimitExceededError extends Error {
  object: string;
  limit: number;

  constructor({ object, limit, message = 'error.common.limitExceeded' }: LimitExceededErrorParams) {
    super(message);
    this.object = object;
    this.limit = limit;
  }
}

type ConflictErrorParams = {
  field: string;
  message?: string;
};

export class ConflictError extends Error {
  field: string;

  constructor({ field, message = 'error.common.conflict' }: ConflictErrorParams) {
    super(message);
    this.field = field;
  }
}
