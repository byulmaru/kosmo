import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HashtagMuteDecision, HashtagMuteScope } from '@kosmo/core/enums';
import { hashtagMuteRuleWorkflow } from '@kosmo/core/temporal/hashtag-mute';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import type {
  HashtagMuteCommand,
  HashtagMuteRuleSnapshot,
} from '@kosmo/core/temporal/hashtag-mute';

const command: HashtagMuteCommand = {
  action: 'CREATE',
  commandId: '00000000-0000-4000-8000-000000000001',
  ownerProfileId: '00000000-0000-4000-8000-000000000002',
  targetHashtagId: '00000000-0000-4000-8000-000000000003',
  scopes: [HashtagMuteScope.HOME],
  decision: HashtagMuteDecision.COLLAPSE,
  expiresAt: null,
};
const snapshot: HashtagMuteRuleSnapshot = {
  id: '00000000-0000-4000-8000-000000000004',
  ownerProfileId: command.ownerProfileId,
  targetHashtagId: command.targetHashtagId,
  scopes: command.scopes,
  decision: command.decision,
  expiresAt: null,
  createdAt: '2026-10-02T00:00:00Z',
  updatedAt: '2026-10-02T00:00:00Z',
};

test(
  'production Workflow의 확정 결과·retry·wire 검증·도메인 실패를 확인한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `hashtag-mute-test-${process.pid}`;
    const calls: HashtagMuteCommand[] = [];
    const worker = await Worker.create({
      workflowsPath: new URL('./workflows/index.ts', import.meta.url).pathname,
      connection: environment.nativeConnection,
      taskQueue,
      activities: {
        executeHashtagMuteRuleActivity: async (input: HashtagMuteCommand) => {
          calls.push(input);
          if (calls.length === 1) {
            throw new Error('Activity completion response lost');
          }
          return input.action === 'DELETE'
            ? { ok: false, error: { code: 'NOT_FOUND', message: 'Rule missing' } }
            : { ok: true, result: { rule: snapshot } };
        },
      },
    });
    await worker.runUntil(async () => {
      const result = await environment.client.workflow.execute(hashtagMuteRuleWorkflow.workflow, {
        workflowId: hashtagMuteRuleWorkflow.workflowIdFromArgs(command),
        taskQueue,
        args: [command],
      });
      assert.deepEqual(result, { rule: snapshot });
      assert.deepEqual(calls, [command, command]);
      const failed = {
        action: 'DELETE',
        commandId: crypto.randomUUID(),
        ownerProfileId: command.ownerProfileId,
        ruleId: snapshot.id,
      } as const;
      await assert.rejects(
        environment.client.workflow.execute(hashtagMuteRuleWorkflow.workflow, {
          workflowId: hashtagMuteRuleWorkflow.workflowIdFromArgs(failed),
          taskQueue,
          args: [failed],
        }),
        (error: unknown) => {
          assert.ok(error instanceof Error && error.cause instanceof Error);
          assert.equal(error.cause.message, 'Rule missing');
          assert.equal((error.cause as { type?: string }).type, 'NOT_FOUND');
          return true;
        },
      );
      assert.equal(calls.length, 3);
      await assert.rejects(
        environment.client.workflow.execute(hashtagMuteRuleWorkflow.workflow, {
          workflowId: `invalid:${crypto.randomUUID()}`,
          taskQueue,
          args: [{ ...command, scopes: [] }],
        }),
      );
      assert.equal(calls.length, 3);
    });
  },
);
