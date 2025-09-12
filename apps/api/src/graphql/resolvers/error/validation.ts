import { FieldError, TypedError, ValidationError } from '@/error';
import { builder } from '@/graphql/builder';

builder.objectType(ValidationError, {
  name: 'ValidationError',
  interfaces: [TypedError, FieldError],
});
