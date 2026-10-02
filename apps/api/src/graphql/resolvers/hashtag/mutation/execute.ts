import {
  ConflictError,
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from '@kosmo/core/error';
import { runWorkflow } from '@kosmo/core/temporal/client';
import { hashtagMuteRuleWorkflow } from '@kosmo/core/temporal/hashtag-mute';
import { ApplicationFailure } from '@temporalio/client';
import type { HashtagMuteCommand } from '@kosmo/core/temporal/hashtag-mute';

export const executeHashtagMuteCommand = async (input: HashtagMuteCommand) => {
  try {
    return await runWorkflow(hashtagMuteRuleWorkflow, {
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
