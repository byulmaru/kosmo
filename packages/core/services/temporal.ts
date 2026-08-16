import { Client, Connection } from '@temporalio/client';

export const KOSMO_TASK_QUEUE = 'kosmo';
export const POST_CREATE_EFFECTS_WORKFLOW_TYPE = 'postCreateEffectsWorkflow';

export type PostCreateEffectsInput = {
  postId: string;
  origin: 'LOCAL' | 'ACTIVITYPUB';
};

export const postCreateEffectsWorkflowId = (postId: string): string =>
  `post-create-effects:${postId}`;

export const postCreateEffectsWorkflowStartOptions = (input: PostCreateEffectsInput) => ({
  args: [input] as [PostCreateEffectsInput],
  taskQueue: KOSMO_TASK_QUEUE,
  workflowId: postCreateEffectsWorkflowId(input.postId),
  workflowIdConflictPolicy: 'USE_EXISTING' as const,
  workflowIdReusePolicy: 'REJECT_DUPLICATE' as const,
});

let client: Client | undefined;

export const temporalClient: Pick<Client, 'workflow'> = {
  get workflow() {
    if (!client) {
      const address = process.env.TEMPORAL_ADDRESS?.trim();
      const namespace = process.env.TEMPORAL_NAMESPACE?.trim();
      if (!address) {
        throw new Error('TEMPORAL_ADDRESS is required');
      }
      if (!namespace) {
        throw new Error('TEMPORAL_NAMESPACE is required');
      }
      client = new Client({ connection: Connection.lazy({ address }), namespace });
    }
    return client.workflow;
  },
};
