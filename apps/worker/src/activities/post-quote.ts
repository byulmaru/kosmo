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
  const consent =
    command.kind === 'request'
      ? (await recordInboundQuoteRequest(command)).consent
      : command.kind === 'accept'
        ? await applyInboundQuoteAccept(command)
        : command.kind === 'reject'
          ? await applyInboundQuoteReject(command)
          : await applyInboundQuoteRevocation(command);
  return consent
    ? {
        consentId: consent.id,
        postId: consent.quotePostId,
        revision: consent.revision,
        sourcePostId: consent.sourcePostId,
      }
    : null;
};
