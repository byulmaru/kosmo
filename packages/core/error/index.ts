export type ErrorCode = 'CONFLICT' | 'NOT_FOUND' | 'PERMISSION_DENIED' | 'VALIDATION';

type KosmoErrorOptions = {
  code: ErrorCode;
  message: string;
};

export class KosmoError extends Error {
  readonly code: ErrorCode;

  constructor({ code, message }: KosmoErrorOptions) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

type FieldErrorOptions = KosmoErrorOptions & {
  field?: string;
};

export class FieldError extends KosmoError {
  readonly field?: string;

  constructor({ field, ...options }: FieldErrorOptions) {
    super(options);
    this.field = field;
  }
}

export class ValidationError extends FieldError {
  constructor(message = 'Invalid input', options: { field?: string } = {}) {
    super({ code: 'VALIDATION', message, field: options.field });
  }
}

export class ConflictError extends FieldError {
  constructor({ message = 'Conflict', field }: { message?: string; field?: string } = {}) {
    super({ code: 'CONFLICT', message, field });
  }
}

export class NotFoundError extends KosmoError {
  constructor(message = 'Not found') {
    super({ code: 'NOT_FOUND', message });
  }
}

export abstract class ForbiddenError extends KosmoError {}

export class PermissionDeniedError extends ForbiddenError {
  constructor(message = 'Permission denied') {
    super({ code: 'PERMISSION_DENIED', message });
  }
}
