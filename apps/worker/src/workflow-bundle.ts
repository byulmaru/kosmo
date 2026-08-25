import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { WorkerOptions } from '@temporalio/worker';

type WorkflowRegistration = Pick<WorkerOptions, 'workflowBundle' | 'workflowsPath'>;

const sourceWorkflowPath = fileURLToPath(new URL('./workflows/index.ts', import.meta.url));
const defaultWorkflowBundlePath = fileURLToPath(new URL('./workflow-bundle.js', import.meta.url));

/**
 * Resolve the workflow registration for the current execution boundary.
 *
 * `workflowsPath` intentionally remains the local-development fallback. The
 * production artifact is emitted beside the bundled Worker host, so the
 * default production path is stable even when Docker does not provide an
 * environment override.
 */
export function getWorkflowRegistration(
  environment: NodeJS.ProcessEnv = process.env,
): WorkflowRegistration {
  const configuredBundlePath = environment.TEMPORAL_WORKFLOW_BUNDLE_PATH?.trim();

  if (configuredBundlePath) {
    if (!existsSync(configuredBundlePath)) {
      throw new Error(`Temporal Workflow bundle is missing: ${configuredBundlePath}`);
    }
    return { workflowBundle: { codePath: configuredBundlePath } };
  }

  if (existsSync(defaultWorkflowBundlePath)) {
    return { workflowBundle: { codePath: defaultWorkflowBundlePath } };
  }

  return { workflowsPath: sourceWorkflowPath };
}
