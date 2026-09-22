import '../polyfill';

import { ApplicationFailure } from '@temporalio/client';
import { ConflictError, NotFoundError, PermissionDeniedError, ValidationError } from '../error';

export const rethrowProfileBlockWorkflowFailure = (error: unknown): never => {
  if (!(error instanceof ApplicationFailure)) {
    throw error;
  }

  switch (error.type) {
    case 'CONFLICT':
      throw new ConflictError({ message: error.message });
    case 'NOT_FOUND':
      throw new NotFoundError(error.message);
    case 'PERMISSION_DENIED':
      throw new PermissionDeniedError(error.message);
    case 'VALIDATION':
      throw new ValidationError(error.message);
    default:
      throw error;
  }
};
