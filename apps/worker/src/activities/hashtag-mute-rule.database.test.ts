import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import {
  db,
  firstOrThrow,
  HashtagMuteRuleCommands,
  HashtagMuteRules,
  Hashtags,
  Instances,
  pg,
  Profiles,
} from '@kosmo/core/db';
import {
  HashtagMuteDecision,
  HashtagMuteScope,
  InstanceKind,
  InstanceState,
  ProfileFollowPolicy,
  ProfileState,
} from '@kosmo/core/enums';
import { eq, inArray } from 'drizzle-orm';
import { executeHashtagMuteRuleActivity } from './hashtag-mute-rule';
import type {
  HashtagMuteCommand,
  HashtagMuteResult,
  HashtagMuteRuleSnapshot,
} from '@kosmo/core/temporal/hashtag-mute';

const instances: string[] = [];
const hashtags: string[] = [];
const fixture = async () => {
  const suffix = crypto.randomUUID();
  const instance = await db
    .insert(Instances)
    .values({ domain: `${suffix}.example`, kind: InstanceKind.LOCAL, state: InstanceState.ACTIVE })
    .returning()
    .then(firstOrThrow);
  instances.push(instance.id);
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
  const hashtag = await db
    .insert(Hashtags)
    .values({ name: suffix, displayName: suffix })
    .returning()
    .then(firstOrThrow);
  hashtags.push(hashtag.id);
  const create: HashtagMuteCommand = {
    action: 'CREATE',
    commandId: crypto.randomUUID(),
    ownerProfileId: owner.id,
    targetHashtagId: hashtag.id,
    scopes: [HashtagMuteScope.HOME],
    decision: HashtagMuteDecision.EXCLUDE,
    expiresAt: null,
  };
  return { instance, owner, hashtag, create };
};
const execute = async (input: HashtagMuteCommand): Promise<HashtagMuteResult> => {
  const result = await executeHashtagMuteRuleActivity(input);
  if (!result.ok) {
    assert.fail(JSON.stringify(result));
  }
  return result.result;
};
const createdRule = async (input: HashtagMuteCommand): Promise<HashtagMuteRuleSnapshot> => {
  const result = await execute(input);
  assert.ok(result.rule);
  return result.rule;
};
afterEach(async () => {
  if (instances.length) {
    const ids = (
      await db
        .select({ id: Profiles.id })
        .from(Profiles)
        .where(inArray(Profiles.instanceId, instances))
    ).map((row) => row.id);
    if (ids.length) {
      await db.delete(Profiles).where(inArray(Profiles.id, ids));
    }
    await db.delete(Instances).where(inArray(Instances.id, instances.splice(0)));
  }
  if (hashtags.length) {
    await db.delete(Hashtags).where(inArray(Hashtags.id, hashtags.splice(0)));
  }
});
after(async () => pg.end());

test('같은 pair의 동시 생성은 하나만 확정하고 기존 값을 덮어쓰지 않는다', async () => {
  const { create, owner } = await fixture();
  const results = await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      executeHashtagMuteRuleActivity({
        ...create,
        commandId: crypto.randomUUID(),
        decision: index % 2 ? HashtagMuteDecision.EXCLUDE : HashtagMuteDecision.COLLAPSE,
      }),
    ),
  );
  assert.equal(results.filter((result) => result.ok).length, 1);
  for (const result of results.filter((result) => !result.ok)) {
    if (!result.ok) {
      assert.equal(result.error.code, 'CONFLICT');
    }
  }
  assert.equal(await db.$count(HashtagMuteRules, eq(HashtagMuteRules.ownerProfileId, owner.id)), 1);
  assert.equal(
    await db.$count(HashtagMuteRuleCommands, eq(HashtagMuteRuleCommands.ownerProfileId, owner.id)),
    1,
  );
});

test('commit 응답 유실 후 create·update·delete 재시도는 원래 결과를 반환하고 후속 변경을 덮지 않는다', async () => {
  const { create, owner, hashtag } = await fixture();
  const rule = await createdRule(create);
  assert.deepEqual(await createdRule(create), rule);
  const update: HashtagMuteCommand = {
    action: 'UPDATE',
    commandId: crypto.randomUUID(),
    ownerProfileId: owner.id,
    ruleId: rule.id,
    scopes: [HashtagMuteScope.LOCAL, HashtagMuteScope.HOME],
    decision: HashtagMuteDecision.COLLAPSE,
    expiresAt: Temporal.Now.instant().add({ hours: 1 }).toString(),
  };
  const changed = await createdRule(update);
  assert.equal(changed.decision, HashtagMuteDecision.COLLAPSE);
  const later = await createdRule({
    action: 'UPDATE',
    commandId: crypto.randomUUID(),
    ownerProfileId: owner.id,
    ruleId: rule.id,
    decision: HashtagMuteDecision.EXCLUDE,
    expiresAt: null,
  });
  assert.deepEqual(await createdRule(update), changed);
  const current = await db
    .select()
    .from(HashtagMuteRules)
    .where(eq(HashtagMuteRules.id, rule.id))
    .then(firstOrThrow);
  assert.equal(current.decision, later.decision);
  assert.equal(current.expiresAt, null);
  const remove: HashtagMuteCommand = {
    action: 'DELETE',
    commandId: crypto.randomUUID(),
    ownerProfileId: owner.id,
    ruleId: rule.id,
  };
  assert.deepEqual(await execute(remove), { deletedRuleId: rule.id });
  assert.deepEqual(await createdRule(create), rule);
  assert.deepEqual(await createdRule(update), changed);
  assert.equal(await db.$count(HashtagMuteRules), 0);
  const replacement = await createdRule({ ...create, commandId: crypto.randomUUID() });
  assert.notEqual(replacement.id, rule.id);
  assert.deepEqual(await execute(remove), { deletedRuleId: rule.id });
  assert.equal(
    await db.$count(HashtagMuteRules, eq(HashtagMuteRules.targetHashtagId, hashtag.id)),
    1,
  );
  const identityReuse = await executeHashtagMuteRuleActivity({
    ...create,
    decision: HashtagMuteDecision.COLLAPSE,
  });
  assert.equal(identityReuse.ok, false);
  if (!identityReuse.ok) {
    assert.equal(identityReuse.error.code, 'CONFLICT');
  }
});

test('만료된 부분 변경은 무변경으로 실패하고 미래·영구 변경과 만료 후 재생성을 허용한다', async () => {
  const { create, owner } = await fixture();
  const rule = await createdRule(create);
  await db
    .update(HashtagMuteRules)
    .set({ expiresAt: Temporal.Now.instant().subtract({ seconds: 1 }) })
    .where(eq(HashtagMuteRules.id, rule.id));
  const before = await db.select().from(HashtagMuteRules).where(eq(HashtagMuteRules.id, rule.id));
  const rejected = await executeHashtagMuteRuleActivity({
    action: 'UPDATE',
    commandId: crypto.randomUUID(),
    ownerProfileId: owner.id,
    ruleId: rule.id,
    decision: HashtagMuteDecision.COLLAPSE,
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.error.code, 'VALIDATION');
  }
  assert.deepEqual(
    await db.select().from(HashtagMuteRules).where(eq(HashtagMuteRules.id, rule.id)),
    before,
  );
  const reactivated = await createdRule({
    action: 'UPDATE',
    commandId: crypto.randomUUID(),
    ownerProfileId: owner.id,
    ruleId: rule.id,
    expiresAt: Temporal.Now.instant().add({ hours: 1 }).toString(),
  });
  assert.ok(reactivated.expiresAt);
  await db
    .update(HashtagMuteRules)
    .set({ expiresAt: Temporal.Now.instant() })
    .where(eq(HashtagMuteRules.id, rule.id));
  const recreated = await createdRule({
    ...create,
    commandId: crypto.randomUUID(),
    scopes: [HashtagMuteScope.SEARCH],
    decision: HashtagMuteDecision.COLLAPSE,
  });
  assert.equal(recreated.expiresAt, null);
  assert.deepEqual(recreated.scopes, [HashtagMuteScope.SEARCH]);
  assert.equal(await db.$count(HashtagMuteRules, eq(HashtagMuteRules.ownerProfileId, owner.id)), 1);
});

test('다른 Owner와 잘못된 최종 상태는 rule과 command를 남기지 않는다', async () => {
  const { create, owner, instance } = await fixture();
  const other = await fixture();
  const rule = await createdRule(create);
  const before = await db.select().from(HashtagMuteRules).where(eq(HashtagMuteRules.id, rule.id));
  for (const action of ['UPDATE', 'DELETE'] as const) {
    const result = await executeHashtagMuteRuleActivity({
      action,
      commandId: crypto.randomUUID(),
      ownerProfileId: other.owner.id,
      ruleId: rule.id,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'NOT_FOUND');
    }
  }
  for (const changes of [{ scopes: [] }, { expiresAt: Temporal.Now.instant().toString() }]) {
    const result = await executeHashtagMuteRuleActivity({
      action: 'UPDATE',
      commandId: crypto.randomUUID(),
      ownerProfileId: owner.id,
      ruleId: rule.id,
      ...changes,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'VALIDATION');
    }
  }
  assert.deepEqual(
    await db.select().from(HashtagMuteRules).where(eq(HashtagMuteRules.id, rule.id)),
    before,
  );
  assert.equal(await db.$count(HashtagMuteRuleCommands), 1);
  await db.delete(HashtagMuteRules).where(eq(HashtagMuteRules.id, rule.id));
  for (const state of [ProfileState.DISABLED, ProfileState.SUSPENDED]) {
    await db.update(Profiles).set({ state }).where(eq(Profiles.id, owner.id));
    const result = await executeHashtagMuteRuleActivity({
      ...create,
      commandId: crypto.randomUUID(),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'PERMISSION_DENIED');
    }
  }
  await db.update(Profiles).set({ state: ProfileState.ACTIVE }).where(eq(Profiles.id, owner.id));
  for (const attributes of [
    { kind: InstanceKind.ACTIVITYPUB },
    { kind: InstanceKind.LOCAL, state: InstanceState.SUSPENDED },
  ]) {
    await db.update(Instances).set(attributes).where(eq(Instances.id, instance.id));
    const result = await executeHashtagMuteRuleActivity({
      ...create,
      commandId: crypto.randomUUID(),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'PERMISSION_DENIED');
    }
  }
  assert.equal(await db.$count(HashtagMuteRules), 0);
  assert.equal(await db.$count(HashtagMuteRuleCommands), 1);
});
