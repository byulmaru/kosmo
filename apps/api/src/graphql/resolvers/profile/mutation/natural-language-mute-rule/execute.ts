import {
  ConflictError,
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from '@kosmo/core/error';
import { runWorkflow } from '@kosmo/core/temporal/client';
import { naturalLanguageMuteRuleWorkflow } from '@kosmo/core/temporal/natural-language-mute';
import { ApplicationFailure } from '@temporalio/client';
import type {
  NaturalLanguageMuteCommand,
  NaturalLanguageMuteResult,
} from '@kosmo/core/temporal/natural-language-mute';

export const executeNaturalLanguageMuteCommand = async (
  input: NaturalLanguageMuteCommand,
): Promise<NaturalLanguageMuteResult> => {
  try {
    return await runWorkflow(naturalLanguageMuteRuleWorkflow, {
      args: [input],
      mode: 'execute',
      workflowIdConflictPolicy: 'FAIL',
      workflowIdReusePolicy: 'REJECT_DUPLICATE',
    });
  } catch (error) {
    if (!(error instanceof ApplicationFailure)) {
      throw error;
    }
    const field = typeof error.details?.[0] === 'string' ? error.details?.[0] : undefined;
    switch (error.type) {
      case 'VALIDATION':
        throw new ValidationError(error.message, { field });
      case 'CONFLICT':
        throw new ConflictError({ message: error.message, field });
      case 'NOT_FOUND':
        throw new NotFoundError(error.message);
      case 'PERMISSION_DENIED':
        throw new PermissionDeniedError(error.message);
      default:
        throw error;
    }
  }
};
