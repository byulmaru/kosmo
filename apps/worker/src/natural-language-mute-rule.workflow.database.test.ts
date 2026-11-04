import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } from '@kosmo/core/enums';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { ApplicationFailure, WorkflowFailedError } from '@temporalio/client';
import { Worker } from '@temporalio/worker';
import { eq } from 'drizzle-orm';
import { createTestWorkflowEnvironment, testWorkflowSource } from './temporal-test-environment.js';
import type { NaturalLanguageMuteCommand } from '@kosmo/core/temporal/natural-language-mute';

process.env.DATABASE_URL ??= 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';

const environment = await createTestWorkflowEnvironment();
process.env.TEMPORAL_ADDRESS = environment.address;
process.env.TEMPORAL_NAMESPACE = environment.namespace ?? 'default';

const [
  { naturalLanguageMuteRuleWorkflow },
  { db, firstOrThrow, Instances, NaturalLanguageMuteRules, pg, Profiles },
  activities,
] = await Promise.all([
  import('@kosmo/core/temporal/natural-language-mute'),
  import('@kosmo/core/db'),
  import('./activities'),
]);

let worker: Worker | undefined;
let workerRun: Promise<void> | undefined;
const instanceIds: string[] = [];
const profileIds: string[] = [];

const fixture = async () => {
  const suffix = randomUUID();
  const instance = await db
    .insert(Instances)
    .values({ domain: `${suffix}.example`, kind: InstanceKind.LOCAL, state: InstanceState.ACTIVE })
    .returning()
    .then(firstOrThrow);
  instanceIds.push(instance.id);
  const owner = await db
    .insert(Profiles)
    .values({
      displayName: suffix,
      followPolicy: ProfileFollowPolicy.OPEN,
      handle: suffix,
      normalizedHandle: suffix,
      instanceId: instance.id,
      state: ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  profileIds.push(owner.id);
  return { owner, instance };
};

after(async () => {
  try {
    if (worker?.getState() === 'RUNNING') {
      worker.shutdown();
    }
    if (workerRun !== undefined) {
      await workerRun;
    }
  } finally {
    if (profileIds.length) {
      await db.delete(Profiles).where(eq(Profiles.id, profileIds.splice(0)[0]!));
    }
    if (instanceIds.length) {
      await db.delete(Instances).where(eq(Instances.id, instanceIds.splice(0)[0]!));
    }
    await pg.end();
    await environment.teardown();
  }
});

test(
  'concurrent CREATE workflows serialize the one-rule-per-Profile cap through PostgreSQL retries',
  { timeout: 120_000 },
  async () => {
    const { owner } = await fixture();
    worker = await Worker.create({
      activities,
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue: KOSMO_TASK_QUEUE,
      ...testWorkflowSource,
    });
    workerRun = worker.run();

    const commands = Array.from(
      { length: 8 },
      (_, index): NaturalLanguageMuteCommand => ({
        action: 'CREATE',
        commandId: randomUUID(),
        ownerProfileId: owner.id,
        condition: `condition ${index}`,
      }),
    );
    const results = await Promise.allSettled(
      commands.map((command) =>
        environment.client.workflow.execute(naturalLanguageMuteRuleWorkflow.workflow, {
          args: [command],
          taskQueue: KOSMO_TASK_QUEUE,
          workflowId: naturalLanguageMuteRuleWorkflow.workflowIdFromArgs(command),
          workflowIdConflictPolicy: 'FAIL',
          workflowIdReusePolicy: 'REJECT_DUPLICATE',
        }),
      ),
    );
    const completed = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    assert.equal(completed.length, 1);
    assert.equal(rejected.length, commands.length - 1);
    for (const result of rejected) {
      if (result.status === 'rejected') {
        assert.ok(result.reason instanceof WorkflowFailedError);
        assert.ok(result.reason.cause instanceof ApplicationFailure);
        assert.equal(result.reason.cause.type, 'CONFLICT');
      }
    }

    const rows = await db
      .select()
      .from(NaturalLanguageMuteRules)
      .where(eq(NaturalLanguageMuteRules.ownerProfileId, owner.id));
    assert.equal(rows.length, 1);
    const winner = completed[0];
    assert.ok(winner?.status === 'fulfilled');
    if (winner?.status === 'fulfilled') {
      const winningRule = winner.value.rule;
      assert.ok(winningRule);
      assert.equal(winningRule.id, rows[0]?.id);
      assert.equal(winningRule.condition, rows[0]?.condition);
    }
  },
);
