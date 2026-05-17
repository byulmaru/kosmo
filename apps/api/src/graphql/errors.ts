import {
  ConflictError,
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from '@kosmo/core/error';
import { builder } from './builder';
import type { FieldError, KosmoError } from '@kosmo/core/error';

const ErrorInterface = builder.interfaceRef<KosmoError>('Error').implement({
  fields: (t) => ({
    message: t.exposeString('message'),
    code: t.exposeString('code'),
  }),
});

const ForbiddenErrorInterface = builder.interfaceRef<KosmoError>('ForbiddenError').implement({
  interfaces: [ErrorInterface],
  fields: () => ({}),
});

const FieldErrorInterface = builder.interfaceRef<FieldError>('FieldError').implement({
  interfaces: [ErrorInterface],
  fields: (t) => ({
    field: t.exposeString('field', { nullable: true }),
  }),
});

builder.objectType(ValidationError, {
  name: 'ValidationError',
  interfaces: [ErrorInterface, FieldErrorInterface],
  fields: () => ({}),
});

builder.objectType(ConflictError, {
  name: 'ConflictError',
  interfaces: [ErrorInterface, FieldErrorInterface],
  fields: () => ({}),
});

builder.objectType(NotFoundError, {
  name: 'NotFoundError',
  interfaces: [ErrorInterface],
  fields: () => ({}),
});

builder.objectType(PermissionDeniedError, {
  name: 'PermissionDeniedError',
  interfaces: [ErrorInterface, ForbiddenErrorInterface],
  fields: () => ({}),
});
