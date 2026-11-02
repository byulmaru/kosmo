import { randomUUID } from 'node:crypto';
import { Connection } from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { temporalTestExecutable } from './temporal-test-executable.js';
import { POST_REQUEST_TEST_SEARCH_ATTRIBUTES } from './temporal-test-search-attributes.js';

// IndexedValueType.INDEXED_VALUE_TYPE_KEYWORD in the Temporal protobuf enum.
const keywordIndexedValueType = 2;

async function provisionNamespace(address: string, namespace: string): Promise<void> {
  const connection = await Connection.connect({ address });
  // The protobuf int64 encoder accepts numeric seconds while the generated type exposes Long.
  const workflowExecutionRetentionPeriod = {
    seconds: 86_400,
  } as unknown as NonNullable<
    Parameters<
      typeof connection.workflowService.registerNamespace
    >[0]['workflowExecutionRetentionPeriod']
  >;

  try {
    await connection.workflowService.registerNamespace({
      namespace,
      workflowExecutionRetentionPeriod,
    });

    const keywordSearchAttributes = {} as NonNullable<
      Parameters<typeof connection.operatorService.addSearchAttributes>[0]['searchAttributes']
    >;
    for (const { name, type } of POST_REQUEST_TEST_SEARCH_ATTRIBUTES) {
      if (type !== 'KEYWORD') {
        throw new Error(`Unsupported Temporal test search attribute type: ${type}`);
      }
      keywordSearchAttributes[name] = keywordIndexedValueType;
    }
    await connection.operatorService.addSearchAttributes({
      namespace,
      searchAttributes: keywordSearchAttributes,
    });
  } finally {
    await connection.close();
  }
}

export async function createTestWorkflowEnvironment(
  namespace?: string,
): Promise<TestWorkflowEnvironment> {
  const address = process.env.KOSMO_TEST_TEMPORAL_ADDRESS?.trim();

  if (address) {
    const environmentNamespace = namespace ?? `kosmo-test-${randomUUID()}`;
    await provisionNamespace(address, environmentNamespace);
    return TestWorkflowEnvironment.createFromExistingServer({
      address,
      namespace: environmentNamespace,
    });
  }

  return TestWorkflowEnvironment.createLocal({
    server: {
      executable: temporalTestExecutable,
      namespace,
      searchAttributes: [...POST_REQUEST_TEST_SEARCH_ATTRIBUTES],
      ui: false,
    },
  });
}

const testWorkflowBundlePath = process.env.KOSMO_TEST_WORKFLOW_BUNDLE_PATH?.trim();

export const testWorkflowSource = testWorkflowBundlePath
  ? { workflowBundle: { codePath: testWorkflowBundlePath } }
  : { workflowsPath: new URL('./workflows/index.ts', import.meta.url).pathname };
