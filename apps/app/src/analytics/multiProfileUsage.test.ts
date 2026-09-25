import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculateMultiProfileUsage,
  createAnalyticsCaptureOptions,
  getKstWeekKey,
  isDirectProfileSwitch,
  isMultiProfileEligible,
  MultiProfileAnalyticsObserver,
} from './multiProfileUsage';
import type { AnalyticsEventArgs, AnalyticsEventProperties } from './events';
import type { MultiProfileUsageEvent } from './multiProfileUsage';

type CapturedEvent = {
  event: string;
  properties: Record<string, unknown>;
  options?: { accountId?: string; uuid?: string; timestamp?: Date };
};

const snapshot = (
  accountId: string,
  observedAt: Date,
  profiles: ReadonlyArray<{ id: string }>,
  selectedProfileId: string | null = profiles[0]?.id ?? null,
) => ({
  accountId,
  observedAt,
  profiles,
  selectedProfileId,
});

const usageEvent = <Name extends keyof AnalyticsEventProperties>(
  accountId: string,
  eventName: Name,
  properties: AnalyticsEventProperties[Name],
  occurredAt: string,
  uuid = `${accountId}-${eventName}-${occurredAt}`,
): MultiProfileUsageEvent =>
  ({
    accountId,
    eventName,
    properties,
    occurredAt: new Date(occurredAt),
    uuid,
  }) as MultiProfileUsageEvent;

const activeEvents = (accountId: string, occurredAt: string, prefix: string) => [
  usageEvent(
    accountId,
    'multi_profile_context_observed',
    {
      observation_kind: 'screen',
      multi_profile_eligible: true,
      selected_profile_id: `${accountId}-profile-a`,
    },
    occurredAt,
    `${prefix}-screen`,
  ),
  usageEvent(
    accountId,
    'profile_selected',
    { selected_profile_id: `${accountId}-profile-b` },
    occurredAt,
    `${prefix}-select`,
  ),
];

describe('multi-profile analytics', () => {
  it('capture options는 Account와 행동 시각을 보존하고 관측마다 UUID를 만든다', () => {
    const occurredAt = new Date('2026-09-22T00:00:00.000Z');
    const first = createAnalyticsCaptureOptions('account-a', occurredAt);
    const second = createAnalyticsCaptureOptions('account-a', occurredAt);

    assert.equal(first.accountId, 'account-a');
    assert.equal(first.timestamp, occurredAt);
    assert.ok(first.uuid);
    assert.match(first.uuid, /^[0-9a-f-]{36}$/i);
    assert.notEqual(first.uuid, second.uuid);
  });

  it('직접 선택이고 출발·도착 Profile이 다를 때만 switched로 분류한다', () => {
    assert.equal(
      isDirectProfileSwitch({
        cause: 'direct',
        previousProfileId: 'profile-a',
        selectedProfileId: 'profile-b',
      }),
      true,
    );
    assert.equal(
      isDirectProfileSwitch({
        cause: 'direct',
        previousProfileId: null,
        selectedProfileId: 'profile-b',
      }),
      false,
    );
    assert.equal(
      isDirectProfileSwitch({
        cause: 'direct',
        previousProfileId: 'profile-a',
        selectedProfileId: 'profile-a',
      }),
      false,
    );
    assert.equal(
      isDirectProfileSwitch({
        cause: 'auto',
        previousProfileId: 'profile-a',
        selectedProfileId: 'profile-b',
      }),
      false,
    );
  });

  it('KST 주차는 일요일 밤과 월요일 0시를 분리한다', () => {
    assert.equal(getKstWeekKey(new Date('2026-09-20T14:59:59.999Z')), '2026-09-14');
    assert.equal(getKstWeekKey(new Date('2026-09-20T15:00:00.000Z')), '2026-09-21');
    assert.equal(getKstWeekKey(new Date('2026-01-01T00:00:00.000Z')), '2025-12-29');
  });

  it('동시에 선택 가능하고 조회 가능한 서로 다른 Profile이 2개 이상일 때만 eligible이다', () => {
    assert.equal(isMultiProfileEligible([]), false);
    assert.equal(isMultiProfileEligible([{ id: 'profile-a' }]), false);
    assert.equal(isMultiProfileEligible([{ id: 'profile-a' }, { id: 'profile-b' }]), true);
    assert.equal(isMultiProfileEligible([{ id: 'profile-a' }, { id: 'profile-a' }]), false);
  });

  it('screen은 선택 Profile을 포함하고 eligibility는 Account×KST week×상태별로 한 번만 보낸다', () => {
    const events: CapturedEvent[] = [];
    const capture = (...args: AnalyticsEventArgs) => {
      events.push({ event: args[0], properties: args[1], options: args[2] });
    };
    const observer = new MultiProfileAnalyticsObserver(capture);
    const profiles = [{ id: 'profile-a' }, { id: 'profile-b' }];
    const first = new Date('2026-09-20T14:59:59.999Z');

    observer.observeScreen(snapshot('account-a', first, profiles, 'profile-a'));
    observer.observeAction(snapshot('account-a', first, profiles, 'profile-a'));
    observer.observeAction(
      snapshot('account-a', new Date('2026-09-20T15:00:00.000Z'), profiles, 'profile-a'),
    );
    observer.observeAction(
      snapshot('account-a', new Date('2026-09-20T15:01:00.000Z'), [{ id: 'profile-a' }]),
    );
    observer.observeAction(
      snapshot('account-a', new Date('2026-09-20T15:02:00.000Z'), [{ id: 'profile-a' }]),
    );

    assert.deepEqual(
      events.map(({ event, properties }) => ({ event, properties })),
      [
        {
          event: 'multi_profile_context_observed',
          properties: {
            observation_kind: 'screen',
            multi_profile_eligible: true,
            selected_profile_id: 'profile-a',
          },
        },
        {
          event: 'multi_profile_context_observed',
          properties: {
            observation_kind: 'eligibility',
            multi_profile_eligible: true,
          },
        },
        {
          event: 'multi_profile_context_observed',
          properties: {
            observation_kind: 'eligibility',
            multi_profile_eligible: false,
          },
        },
      ],
    );
    assert.equal(events[0]?.options?.accountId, 'account-a');
    assert.equal(events[0]?.options?.timestamp, first);
    assert.match(events[0]?.options?.uuid ?? '', /^[0-9a-f-]{36}$/i);
  });

  it('다시 방문한 화면은 screen을 다시 보내지만 같은 주차 자격은 중복하지 않는다', () => {
    const events: CapturedEvent[] = [];
    const observer = new MultiProfileAnalyticsObserver((...args) => {
      events.push({ event: args[0], properties: args[1], options: args[2] });
    });
    const observedAt = new Date('2026-09-22T00:00:00.000Z');
    const value = snapshot(
      'account-a',
      observedAt,
      [{ id: 'profile-a' }, { id: 'profile-b' }],
      'profile-b',
    );

    observer.observeScreen(value);
    observer.observeScreen(value);

    assert.equal(
      events.filter(({ properties }) => properties.observation_kind === 'screen').length,
      2,
    );
    assert.equal(
      events.filter(({ properties }) => properties.observation_kind === 'eligibility').length,
      0,
    );
  });

  it('합성 주간 집계는 승인된 집합과 중복 제거 규칙을 재현한다', () => {
    const events: MultiProfileUsageEvent[] = [];
    const occurredAt = '2026-09-15T00:00:00.000Z';

    for (let index = 1; index <= 10; index += 1) {
      const accountId = `account-${index}`;
      events.push(
        usageEvent(
          accountId,
          'multi_profile_context_observed',
          {
            observation_kind: 'screen',
            multi_profile_eligible: index <= 4,
            ...(index <= 4 ? { selected_profile_id: `${accountId}-profile-a` } : {}),
          },
          occurredAt,
          `screen-${accountId}`,
        ),
      );
    }

    events.push(
      usageEvent(
        'account-1',
        'profile_selected',
        { selected_profile_id: 'account-1-profile-b' },
        occurredAt,
        'select-account-1',
      ),
      usageEvent(
        'account-2',
        'profile_selected',
        { selected_profile_id: 'account-2-profile-b' },
        occurredAt,
        'select-account-2',
      ),
      usageEvent(
        'account-1',
        'profile_created',
        { selected_profile_id: 'created-profile-1' },
        occurredAt,
        'create-account-1-a',
      ),
      usageEvent(
        'account-1',
        'profile_created',
        { selected_profile_id: 'created-profile-2' },
        occurredAt,
        'create-account-1-b',
      ),
      usageEvent(
        'account-1',
        'profile_created',
        { selected_profile_id: 'created-profile-1' },
        '2026-09-15T01:00:00.000Z',
        'create-account-1-a',
      ),
      usageEvent(
        'account-1',
        'profile_switched',
        { previous_profile_id: 'account-1-profile-a', selected_profile_id: 'account-1-profile-b' },
        occurredAt,
        'switch-account-1',
      ),
      usageEvent(
        'account-2',
        'profile_switched',
        { previous_profile_id: 'account-2-profile-a', selected_profile_id: 'account-2-profile-b' },
        occurredAt,
        'switch-account-2',
      ),
      usageEvent(
        'account-1',
        'profile_switched',
        { previous_profile_id: 'account-1-profile-a', selected_profile_id: 'account-1-profile-b' },
        '2026-09-15T01:00:00.000Z',
        'switch-account-1',
      ),
      usageEvent(
        'account-1',
        'post_created',
        { selected_profile_id: 'account-1-profile-b', visibility: 'PUBLIC' },
        occurredAt,
        'post-account-1',
      ),
      usageEvent(
        'account-2',
        'follow_succeeded',
        { selected_profile_id: 'account-2-profile-b', result: 'request' },
        occurredAt,
        'follow-account-2',
      ),
      usageEvent(
        'account-11',
        'multi_profile_context_observed',
        { observation_kind: 'eligibility', multi_profile_eligible: true },
        occurredAt,
        'eligibility-only-account-11',
      ),
    );

    const result = calculateMultiProfileUsage(events, {
      now: new Date('2026-09-22T00:00:00.000Z'),
      calculatedAt: new Date('2026-09-22T00:05:00.000Z'),
      exclusionListVersion: '2026-09-22',
    });
    const week = result.weeks.find(({ weekKey }) => weekKey === '2026-09-14');

    assert.ok(week);
    assert.equal(week.status, 'complete');
    assert.equal(week.waaCount, 10);
    assert.equal(week.targetWaaCount, 4);
    assert.equal(week.activeAccountCount, 2);
    assert.equal(week.activeUsageRate, 50);
    assert.equal(week.reachRate, 20);
    assert.equal(week.profileCreatedCount, 2);
    assert.equal(week.profileCreatedAccountCount, 1);
    assert.equal(week.directSwitchCount, 2);
    assert.equal(week.averageDirectSwitchesPerActiveAccount, 1);
    assert.equal(week.postCreatedCount, 1);
    assert.equal(week.followSucceededCount, 1);
    assert.equal(week.followRequestCount, 1);
    assert.equal(week.followRelationshipCount, 0);
    assert.equal(result.rulesVersion, 'multi-profile-usage.v1');
    assert.equal(result.exclusionListVersion, '2026-09-22');
    assert.equal(result.calculatedAt.toISOString(), '2026-09-22T00:05:00.000Z');
  });

  it('잘못된 행동 시각은 해당 행만 건너뛰고 건수를 기록한다', () => {
    const events = [
      usageEvent(
        'account-a',
        'profile_selected',
        { selected_profile_id: 'profile-a' },
        '2026-09-22T00:00:00.000Z',
        'valid',
      ),
      usageEvent(
        'account-a',
        'profile_selected',
        { selected_profile_id: 'profile-b' },
        'invalid',
        'bad',
      ),
      usageEvent(
        'account-b',
        'profile_selected',
        { selected_profile_id: 'profile-c' },
        'invalid',
        'excluded',
      ),
    ];
    const result = calculateMultiProfileUsage(events, {
      now: new Date('2026-09-29T00:00:00.000Z'),
      excludedAccountIds: new Set(['account-b']),
    });

    assert.equal(result.skippedInvalidTimestampCount, 1);
    assert.equal(result.weeks.length, 1);
    assert.equal(result.weeks[0]?.waaCount, 1);
    assert.equal(result.weeks[0]?.weekKey, '2026-09-21');
  });

  it('분모 0은 null이고 최신 제외 목록은 Account 전체에 적용된다', () => {
    const events = [
      usageEvent(
        'account-a',
        'multi_profile_context_observed',
        {
          observation_kind: 'screen',
          multi_profile_eligible: false,
          selected_profile_id: 'profile-a',
        },
        '2026-09-22T00:00:00.000Z',
        'screen-a',
      ),
      usageEvent(
        'account-b',
        'multi_profile_context_observed',
        {
          observation_kind: 'screen',
          multi_profile_eligible: true,
          selected_profile_id: 'profile-a',
        },
        '2026-09-22T00:00:00.000Z',
        'screen-b',
      ),
      usageEvent(
        'account-b',
        'profile_selected',
        { selected_profile_id: 'profile-b' },
        '2026-09-22T00:00:00.000Z',
        'select-b',
      ),
    ];

    const result = calculateMultiProfileUsage(events, {
      now: new Date('2026-09-22T00:00:00.000Z'),
      excludedAccountIds: new Set(['account-b']),
    });
    const week = result.weeks[0];

    assert.ok(week);
    assert.equal(week.waaCount, 1);
    assert.equal(week.targetWaaCount, 0);
    assert.equal(week.activeAccountCount, 0);
    assert.equal(week.activeUsageRate, null);
    assert.equal(week.reachRate, 0);
    assert.equal(week.averageDirectSwitchesPerActiveAccount, null);
  });

  it('기능·제품 리텐션은 KST 기준 cohort와 미도래 주를 구분한다', () => {
    const events = [
      ...activeEvents('account-a', '2026-08-31T01:00:00.000Z', 'base-a'),
      usageEvent(
        'account-b',
        'multi_profile_context_observed',
        {
          observation_kind: 'screen',
          multi_profile_eligible: true,
          selected_profile_id: 'account-b-profile-a',
        },
        '2026-08-31T01:00:00.000Z',
        'base-b',
      ),
      ...activeEvents('account-a', '2026-09-07T01:00:00.000Z', 'week-1-a'),
      usageEvent(
        'account-b',
        'multi_profile_context_observed',
        {
          observation_kind: 'screen',
          multi_profile_eligible: false,
          selected_profile_id: 'account-b-profile-a',
        },
        '2026-09-07T01:00:00.000Z',
        'week-1-b',
      ),
      ...activeEvents('account-a', '2026-09-28T01:00:00.000Z', 'week-4-a'),
    ];

    const complete = calculateMultiProfileUsage(events, {
      now: new Date('2026-10-06T00:00:00.000Z'),
    });
    const base = complete.weeks.find(({ weekKey }) => weekKey === '2026-08-31');

    assert.ok(base);
    assert.equal(base.status, 'complete');
    assert.equal(base.featureRetentionW1, 100);
    assert.equal(base.featureRetentionW4, 100);
    assert.equal(base.productRetentionW1, 100);
    assert.equal(base.productRetentionW4, 50);

    const partial = calculateMultiProfileUsage(events, {
      now: new Date('2026-09-29T00:00:00.000Z'),
    });
    const partialBase = partial.weeks.find(({ weekKey }) => weekKey === '2026-08-31');
    assert.ok(partialBase);
    assert.equal(partialBase.featureRetentionW4, 'not_due');
    assert.equal(partialBase.productRetentionW4, 'not_due');
  });

  it('기능 리텐션은 재방문 Account를 다음 주의 신규 cohort에 다시 넣지 않는다', () => {
    const events = [
      ...activeEvents('account-a', '2026-08-31T01:00:00.000Z', 'base-a'),
      ...activeEvents('account-a', '2026-09-07T01:00:00.000Z', 'week-1-a'),
      ...activeEvents('account-b', '2026-09-07T01:00:00.000Z', 'week-1-b'),
      ...activeEvents('account-b', '2026-09-14T01:00:00.000Z', 'week-2-b'),
    ];

    const result = calculateMultiProfileUsage([...events].reverse(), {
      now: new Date('2026-09-29T00:00:00.000Z'),
    });
    const base = result.weeks.find(({ weekKey }) => weekKey === '2026-08-31');
    const next = result.weeks.find(({ weekKey }) => weekKey === '2026-09-07');
    const last = result.weeks.find(({ weekKey }) => weekKey === '2026-09-14');

    assert.ok(base);
    assert.ok(next);
    assert.ok(last);
    assert.equal(base.featureRetentionW1, 100);
    assert.equal(next.activeAccountCount, 2);
    assert.equal(next.featureRetentionW1, 100);
    assert.equal(next.productRetentionW1, 50);
    assert.equal(last.featureRetentionW1, null);
  });
});
