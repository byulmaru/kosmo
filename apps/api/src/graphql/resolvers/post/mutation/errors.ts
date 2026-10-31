import {
  ConflictError,
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from '@kosmo/core/error';
import { ApplicationFailure } from '@temporalio/client';

export const rethrowPostWorkflowFailure = (error: unknown): never => {
  if (!(error instanceof ApplicationFailure)) {
    throw error;
  }

  const field = typeof error.details?.[0] === 'string' ? error.details[0] : undefined;
  switch (error.type) {
    case 'CONFLICT':
      throw new ConflictError({ message: error.message, field });
    case 'NOT_FOUND':
      throw new NotFoundError(error.message);
    case 'PERMISSION_DENIED':
      throw new PermissionDeniedError(error.message);
    case 'VALIDATION':
      throw new ValidationError(error.message, { field });
    default:
      throw error;
  }
};
