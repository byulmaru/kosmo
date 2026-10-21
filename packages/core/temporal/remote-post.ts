import type { WorkflowDefinition } from './client';

export const REMOTE_POST_LOOKUP_WORKFLOW_TYPE = 'remotePostLookupWorkflow';
export const REMOTE_POST_LOOKUP_MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

export type RemotePostLookupInput = {
  readonly objectUri: string;
  readonly signingProfileId?: string;
  readonly advertisingActorUri?: string;
  readonly maxDocumentBytes?: number;
};

export type RemotePostLookupResult =
  | {
      readonly status: 'created' | 'duplicate';
      readonly postId: string;
      readonly authorProfileId: string;
      readonly documentBytes: number;
    }
  | {
      readonly status: 'rejected';
      readonly reason:
        | 'document_budget_exceeded'
        | 'invalid_note'
        | 'note_content_length_exceeded'
        | 'note_mention_limit_exceeded'
        | 'no_active_local_mention'
        | 'unsupported_note'
        | 'unusable_author';
      readonly documentBytes: number;
    };

export const remotePostLookupWorkflow: WorkflowDefinition<
  (input: RemotePostLookupInput) => Promise<RemotePostLookupResult>
> = {
  workflow: REMOTE_POST_LOOKUP_WORKFLOW_TYPE,
  workflowIdFromArgs: (input) =>
    `${REMOTE_POST_LOOKUP_WORKFLOW_TYPE}:${JSON.stringify([
      input.objectUri,
      input.signingProfileId ?? 'configured-local',
      input.advertisingActorUri ?? 'any-author',
      input.maxDocumentBytes ?? REMOTE_POST_LOOKUP_MAX_DOCUMENT_BYTES,
    ])}`,
};
