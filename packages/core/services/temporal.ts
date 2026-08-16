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

let temporalClientPromise: Promise<Client> | undefined;

const connectTemporalClient = async (): Promise<Client> => {
  const address = process.env.TEMPORAL_ADDRESS?.trim();
  const namespace = process.env.TEMPORAL_NAMESPACE?.trim();
  if (!address) {
    throw new Error('TEMPORAL_ADDRESS is required');
  }
  if (!namespace) {
    throw new Error('TEMPORAL_NAMESPACE is required');
  }

  const connection = await Connection.connect({ address });
  return new Client({ connection, namespace });
};

const getTemporalClient = (): Promise<Client> => {
  temporalClientPromise ??= connectTemporalClient().catch((error) => {
    // A failed connection must not poison later post-commit effects. The next
    // effect will establish a fresh connection and retry the start request.
    temporalClientPromise = undefined;
    throw error;
  });
  return temporalClientPromise;
};

export const startPostCreateEffectsWorkflow = async (
  input: PostCreateEffectsInput,
): Promise<void> => {
  const client = await getTemporalClient();
  await client.workflow.start(
    POST_CREATE_EFFECTS_WORKFLOW_TYPE,
    postCreateEffectsWorkflowStartOptions(input),
  );
};
