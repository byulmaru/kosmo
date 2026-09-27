import {
  applyInboundQuoteAccept,
  applyInboundQuoteReject,
  applyInboundQuoteRevocation,
  recordInboundQuoteRequest,
} from '@kosmo/core/services';
import type { PostQuoteCommand, PostQuoteCommandResult } from '@kosmo/core/temporal/workflows';

export const executePostQuoteCommandActivity = async (
  command: PostQuoteCommand,
): Promise<PostQuoteCommandResult> => {
  const revocation = command.kind === 'revoke' ? await applyInboundQuoteRevocation(command) : null;
  const consent =
    command.kind === 'request'
      ? (await recordInboundQuoteRequest(command)).consent
      : command.kind === 'accept'
        ? await applyInboundQuoteAccept(command)
        : command.kind === 'reject'
          ? await applyInboundQuoteReject(command)
          : revocation?.consent;
  return consent
    ? {
        forwardEligible: revocation?.forwardEligible ?? false,
        consentId: consent.id,
        postId: consent.quotePostId,
        revision: consent.revision,
        sourcePostId: consent.sourcePostId,
      }
    : null;
};
