import { FieldError, ValidationError } from '@/errors';
import { builder } from '@/graphql/builder';

builder.objectType(ValidationError, {
  name: 'ValidationError',
  interfaces: [Error, FieldError],
});
