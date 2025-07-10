import { GraphQLError } from 'graphql';

export class NotFoundError extends GraphQLError {
  constructor() {
    super('Not Found', { extensions: { type: 'NotFoundError', code: 'NOT_FOUND', status: 404 } });
  }
}

export class UnauthorizedError extends GraphQLError {
  constructor() {
    super('Unauthorized', {
      extensions: { type: 'UnauthorizedError', code: 'UNAUTHORIZED', status: 401 },
    });
  }
}

export class ForbiddenError extends GraphQLError {
  constructor() {
    super('Forbidden', { extensions: { type: 'ForbiddenError', code: 'FORBIDDEN', status: 403 } });
  }
}

type ValidationErrorParams = {
  message?: string;
};

export class ValidationError extends GraphQLError {
  constructor({ message }: ValidationErrorParams) {
    super(message ?? 'Validation Error', {
      extensions: { type: 'ValidationError', code: 'VALIDATION_ERROR', status: 400 },
    });
  }
}

type LimitExceededErrorParams = {
  object: string;
  limit: number;
};

export class LimitExceededError extends GraphQLError {
  constructor({ object, limit }: LimitExceededErrorParams) {
    super(`Limit Exceeded: ${object}`, {
      extensions: {
        type: 'LimitExceededError',
        code: 'LIMIT_EXCEEDED',
        status: 402,
        object,
        limit,
      },
    });
  }
}

type ConflictErrorParams = {
  field: string;
  message?: string;
};

export class ConflictError extends GraphQLError {
  constructor({ field, message = 'error.common.conflict' }: ConflictErrorParams) {
    super(message, {
      extensions: { type: 'ConflictError', code: 'CONFLICT', status: 409, field, message },
    });
  }
}
