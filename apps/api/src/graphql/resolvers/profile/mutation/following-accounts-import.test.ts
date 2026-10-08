import assert from 'node:assert/strict';
import test from 'node:test';
import { db, Profiles } from '@kosmo/core/db';
import { AccountProfileRole, InstanceKind, InstanceState } from '@kosmo/core/enums';
import { ValidationError } from '@kosmo/core/error';
import { temporalClient } from '@kosmo/core/temporal/client';
import { FOLLOWING_ACCOUNTS_IMPORT_WORKFLOW_TYPE } from '@kosmo/core/temporal/workflows';
import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy } from '@temporalio/client';
import { graphql } from 'graphql';
import { parseFollowingAccountsCsv } from './following-accounts-import';

const LOCAL_DOMAIN = 'kosmo.example';

test('following CSV accepts BOM, CRLF, quoted optional columns, blank rows, and canonicalizes addresses', () => {
  const addresses = parseFollowingAccountsCsv(
    '\uFEFFAccount address,Show boosts,Notify on new posts,Languages\r\n' +
      '  @alice@EXAMPLE.com  ,"true",false,en\r\n' +
      'alice@example.com,false,false,\r\n' +
      'localuser@KOSMO.example,false,false,\r\n' +
      '  ,,,\r\n' +
      '@localuser@kosmo.example,,,',
    LOCAL_DOMAIN,
  );

  assert.deepEqual(addresses, [
    { kind: 'remote', handle: 'alice', domain: 'example.com' },
    { kind: 'local', handle: 'localuser' },
  ]);
});

test('following CSV accepts local handles reserved only for profile creation', () => {
  assert.deepEqual(
    parseFollowingAccountsCsv('Account address\nkosmo@kosmo.example', LOCAL_DOMAIN),
    [{ kind: 'local', handle: 'kosmo' }],
  );
});

test('following CSV deduplicates remote handles by existing normalized identity', () => {
  const addresses = parseFollowingAccountsCsv(
    'Account address\nAlice@example.com\nalice@EXAMPLE.com',
    LOCAL_DOMAIN,
  );

  assert.deepEqual(addresses, [{ kind: 'remote', handle: 'Alice', domain: 'example.com' }]);
});

test('following CSV rejects malformed data, missing required headers, and invalid nonblank rows', () => {
  for (const csv of [
    'Handle\nalice@example.com',
    'Account address\nalice',
    'Account address\nalice@example.com,"unterminated',
    'Account address,Show boosts\n, true',
    'Account address\ninvalid@@example.com',
  ]) {
    assert.throws(
      () => parseFollowingAccountsCsv(csv, LOCAL_DOMAIN),
      (error) => error instanceof ValidationError && error.field === 'csv',
      csv,
    );
  }
});

test('following CSV reports the invalid account-address row without echoing its value', () => {
  assert.throws(
    () =>
      parseFollowingAccountsCsv(
        'Account address\nalice@example.com\nmalformed@@example.com',
        LOCAL_DOMAIN,
      ),
    (error) => {
      assert.ok(error instanceof ValidationError);
      assert.equal(error.field, 'csv');
      assert.match(error.message, /2번째 계정 주소/);
      assert.match(error.message, /user@example\.com/);
      assert.doesNotMatch(error.message, /malformed@@example\.com/);
      return true;
    },
  );
});

test('following CSV rejects oversized files and row counts before deduplication', () => {
  assert.throws(
    () => parseFollowingAccountsCsv(`Account address\n${'a'.repeat(512 * 1024)}`, LOCAL_DOMAIN),
    (error) => error instanceof ValidationError && error.field === 'csv',
  );

  const repeatedRows = Array.from({ length: 10_001 }, () => 'alice@example.com').join('\n');
  assert.throws(
    () => parseFollowingAccountsCsv(`Account address\n${repeatedRows}`, LOCAL_DOMAIN),
    (error) => error instanceof ValidationError && error.field === 'csv',
  );
});

test('following CSV rejects inputs with no account addresses', () => {
  assert.throws(
    () => parseFollowingAccountsCsv('Account address,Show boosts\n,\n', LOCAL_DOMAIN),
    /가져올 계정 주소가 없어요/,
  );
});

test('importFollowingAccounts acknowledges only a successful Temporal start', async (t) => {
  const origin = 'https://import-test.example';
  const previousOrigin = process.env.PUBLIC_ORIGIN;
  process.env.PUBLIC_ORIGIN = origin;
  t.after(() => {
    if (previousOrigin === undefined) {
      delete process.env.PUBLIC_ORIGIN;
    } else {
      process.env.PUBLIC_ORIGIN = previousOrigin;
    }
  });

  const instance = {
    id: '00000000-0000-8000-8000-000000000010',
    domain: 'import-test.example',
    kind: InstanceKind.LOCAL,
    state: InstanceState.ACTIVE,
    canonicalOrigin: origin,
  };
  let selectedProfileKind: InstanceKind = InstanceKind.LOCAL;
  let querySource: unknown;
  const query = {
    from: (table: unknown) => {
      querySource = table;
      return query;
    },
    innerJoin: () => query,
    where: () => query,
    limit: () => query,
    then: (onFulfilled: (rows: unknown[]) => unknown) =>
      Promise.resolve(
        querySource === Profiles ? [{ instanceKind: selectedProfileKind }] : [instance],
      ).then(onFulfilled),
  };
  t.mock.method(db, 'select', () => query as never);

  let failStart = false;
  const starts: { workflowType: unknown; options: unknown }[] = [];
  type WorkflowStartArgs = Parameters<typeof temporalClient.workflow.start>;
  t.mock.method(
    temporalClient.workflow,
    'start',
    async (workflowType: WorkflowStartArgs[0], options: WorkflowStartArgs[1]) => {
      starts.push({ workflowType, options });
      if (failStart) {
        throw new Error('Temporal start failed');
      }
      return {} as never;
    },
  );

  const { schema } = await import('@/graphql/schema');
  const contextValue = {
    session: {
      id: '00000000-0000-8000-8000-000000000011',
      accountId: 'account-id',
      profile: {
        id: '00000000-0000-8000-8000-000000000012',
        role: AccountProfileRole.MEMBER,
      },
    },
  };
  const source = `mutation Import($csv: String!) {
    importFollowingAccounts(input: { csv: $csv }) { accepted }
  }`;
  const execute = (csv: string) =>
    graphql({
      schema,
      source,
      variableValues: { csv },
      contextValue,
    });

  const invalid = await execute('Account address\nalice');
  assert.ok(invalid.errors?.length);
  assert.equal(starts.length, 0);

  const noSelectedProfile = await graphql({
    schema,
    source,
    variableValues: { csv: 'Account address\nalice@remote.example' },
    contextValue: {
      session: {
        id: '00000000-0000-8000-8000-000000000011',
        accountId: 'account-id',
        profile: null,
      },
    } as never,
  });
  assert.ok(noSelectedProfile.errors?.length);
  assert.equal(starts.length, 0);

  selectedProfileKind = InstanceKind.ACTIVITYPUB;
  const remoteSelectedProfile = await execute('Account address\nalice@remote.example');
  assert.ok(remoteSelectedProfile.errors?.length);
  assert.equal(starts.length, 0);
  selectedProfileKind = InstanceKind.LOCAL;

  const accepted = await execute('Account address\nAlice@REMOTE.example');
  assert.equal(accepted.errors, undefined, JSON.stringify(accepted.errors));
  assert.equal(
    (accepted.data as { importFollowingAccounts?: { accepted?: boolean } } | null)
      ?.importFollowingAccounts?.accepted,
    true,
  );
  assert.equal(starts.length, 1);
  const firstStart = starts[0]!.options as {
    readonly args: readonly unknown[];
    readonly workflowId: string;
    readonly workflowIdConflictPolicy: WorkflowIdConflictPolicy;
    readonly workflowIdReusePolicy: WorkflowIdReusePolicy;
  };
  assert.equal(
    firstStart.workflowId,
    `${FOLLOWING_ACCOUNTS_IMPORT_WORKFLOW_TYPE}:${contextValue.session.profile.id}`,
  );
  assert.equal(firstStart.workflowIdConflictPolicy, WorkflowIdConflictPolicy.FAIL);
  assert.equal(firstStart.workflowIdReusePolicy, WorkflowIdReusePolicy.ALLOW_DUPLICATE);
  assert.deepEqual(firstStart.args, [
    {
      followerProfileId: contextValue.session.profile.id,
      addresses: [{ kind: 'remote', handle: 'Alice', domain: 'remote.example' }],
    },
  ]);

  failStart = true;
  const rejected = await execute('Account address\nBob@REMOTE.example');
  assert.ok(rejected.errors?.length);
  assert.equal(rejected.data, null);
  assert.equal(starts.length, 2);
  const secondStart = starts[1]!.options as typeof firstStart;
  assert.equal(secondStart.workflowId, firstStart.workflowId);
  assert.equal(secondStart.workflowIdConflictPolicy, WorkflowIdConflictPolicy.FAIL);
});
