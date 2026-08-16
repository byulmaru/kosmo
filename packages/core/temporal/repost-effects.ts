import { KOSMO_TASK_QUEUE } from './post-create-effects';

export const REPOST_EFFECTS_WORKFLOW_TYPE = 'repostEffectsWorkflow';

export type RepostOrigin = 'LOCAL' | 'ACTIVITYPUB';
export type RepostVisibility = 'PUBLIC' | 'UNLISTED' | 'FOLLOWERS' | 'DIRECT';

export type RepostCreateEffectsInput = {
  readonly origin: RepostOrigin;
  readonly repostId: string;
  readonly transition: 'CREATE';
};

export type RepostDeleteEffectsInput = {
  readonly actorProfileId: string;
  /** The committed Post.createdAt value serialized for Temporal transport. */
  readonly createdAt: string;
  readonly origin: RepostOrigin;
  readonly repostId: string;
  readonly sourcePostId: string;
  readonly transition: 'DELETE';
  readonly visibility: RepostVisibility;
};

export type RepostEffectsInput = RepostCreateEffectsInput | RepostDeleteEffectsInput;

export const repostEffectsWorkflowId = ({
  repostId,
  transition,
}: Pick<RepostEffectsInput, 'repostId' | 'transition'>): string =>
  `repost-effects:${repostId}:${transition.toLowerCase()}`;

export const repostEffectsWorkflowStartOptions = (input: RepostEffectsInput) => ({
  args: [input] as [RepostEffectsInput],
  taskQueue: KOSMO_TASK_QUEUE,
  workflowId: repostEffectsWorkflowId(input),
  workflowIdConflictPolicy: 'USE_EXISTING' as const,
  workflowIdReusePolicy: 'REJECT_DUPLICATE' as const,
});
