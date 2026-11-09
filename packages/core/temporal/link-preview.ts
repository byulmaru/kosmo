import { createHash } from 'node:crypto';
import type { LinkPreview } from '@kosmo/core/link-preview';
import type { WorkflowDefinition } from './client';

export const LINK_PREVIEW_REFRESH_WORKFLOW_TYPE = 'linkPreviewRefreshWorkflow';

export type LinkPreviewRefreshInput = {
  readonly url: string;
};

export const getLinkPreviewUrlHash = (url: string): string =>
  createHash('sha256').update(url).digest('hex');

export const linkPreviewRefreshWorkflow: WorkflowDefinition<
  (input: LinkPreviewRefreshInput) => Promise<LinkPreview | null>
> = {
  workflow: LINK_PREVIEW_REFRESH_WORKFLOW_TYPE,
  workflowIdFromArgs: ({ url }) =>
    `${LINK_PREVIEW_REFRESH_WORKFLOW_TYPE}:${getLinkPreviewUrlHash(url)}`,
  timeoutMs: 5_000,
};
