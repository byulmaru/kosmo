import { trackAnalytics } from './client';
import type {
  AnalyticsCaptureOptions,
  AnalyticsEventArgs,
  AnalyticsEventName,
  AnalyticsEventProperties,
} from './events';

export const KST_TIME_ZONE = 'Asia/Seoul';

const kstDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: '2-digit',
  timeZone: KST_TIME_ZONE,
  year: 'numeric',
});

function createUuid(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export type AnalyticsProfileSnapshot = {
  id: string;
};

export type MultiProfileAnalyticsSnapshot = {
  accountId: string;
  observedAt: Date;
  profiles: ReadonlyArray<AnalyticsProfileSnapshot>;
  selectedProfileId: string | null;
};

export type AnalyticsCapture = (...args: AnalyticsEventArgs) => void;

export type AnalyticsOperation = Readonly<{
  accountId: string;
  uuid: string;
}>;

export function beginAnalyticsOperation(accountId: string): AnalyticsOperation {
  return { accountId, uuid: createUuid() };
}

export function completeAnalyticsOperation(
  operation: AnalyticsOperation,
  timestamp = new Date(),
): AnalyticsCaptureOptions {
  return { accountId: operation.accountId, timestamp, uuid: operation.uuid };
}

export type ProfileSelectionCause = 'auto' | 'direct';

export function isDirectProfileSwitch({
  cause,
  previousProfileId,
  selectedProfileId,
}: {
  cause: ProfileSelectionCause;
  previousProfileId: string | null;
  selectedProfileId: string;
}): boolean {
  return (
    cause === 'direct' && previousProfileId !== null && previousProfileId !== selectedProfileId
  );
}

export function getKstWeekKey(value: Date): string {
  if (Number.isNaN(value.getTime())) {
    throw new RangeError('A valid date is required to calculate a KST week key.');
  }

  const parts = Object.fromEntries(
    kstDateFormatter.formatToParts(value).map(({ type, value: partValue }) => [type, partValue]),
  );
  const localDate = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)),
  );
  const daysSinceMonday = (localDate.getUTCDay() + 6) % 7;
  localDate.setUTCDate(localDate.getUTCDate() - daysSinceMonday);
  return localDate.toISOString().slice(0, 10);
}

export function isMultiProfileEligible(profiles: ReadonlyArray<AnalyticsProfileSnapshot>): boolean {
  return new Set(profiles.map((profile) => profile.id)).size >= 2;
}

export function createAnalyticsCaptureOptions(
  accountId: string,
  timestamp = new Date(),
  uuid = createUuid(),
): AnalyticsCaptureOptions {
  return { accountId, timestamp, uuid };
}

export class MultiProfileAnalyticsObserver {
  private readonly lastEligibilityByAccountWeek = new Map<string, boolean>();

  constructor(private readonly capture: AnalyticsCapture = trackAnalytics) {}

  observeScreen(snapshot: MultiProfileAnalyticsSnapshot): void {
    if (!snapshot.accountId) {
      return;
    }

    const eligible = isMultiProfileEligible(snapshot.profiles);
    const properties: AnalyticsEventProperties['multi_profile_context_observed'] = {
      observation_kind: 'screen',
      multi_profile_eligible: eligible,
      ...(snapshot.selectedProfileId ? { selected_profile_id: snapshot.selectedProfileId } : {}),
    };
    this.capture(
      'multi_profile_context_observed',
      properties,
      createAnalyticsCaptureOptions(snapshot.accountId, snapshot.observedAt),
    );
    this.rememberEligibility(snapshot, eligible);
  }

  observeAction(snapshot: MultiProfileAnalyticsSnapshot): void {
    this.observeEligibility(snapshot);
  }

  observeEligibility(snapshot: MultiProfileAnalyticsSnapshot): void {
    if (!snapshot.accountId) {
      return;
    }

    const eligible = isMultiProfileEligible(snapshot.profiles);
    const key = this.getEligibilityKey(snapshot);
    if (this.lastEligibilityByAccountWeek.get(key) === eligible) {
      return;
    }

    this.capture(
      'multi_profile_context_observed',
      {
        observation_kind: 'eligibility',
        multi_profile_eligible: eligible,
      },
      createAnalyticsCaptureOptions(snapshot.accountId, snapshot.observedAt),
    );
    this.rememberEligibility(snapshot, eligible);
  }

  private getEligibilityKey(snapshot: MultiProfileAnalyticsSnapshot): string {
    return `${snapshot.accountId}:${getKstWeekKey(snapshot.observedAt)}`;
  }

  private rememberEligibility(snapshot: MultiProfileAnalyticsSnapshot, eligible: boolean): void {
    this.lastEligibilityByAccountWeek.set(this.getEligibilityKey(snapshot), eligible);
  }
}

export type MultiProfileUsageEvent = {
  [Name in AnalyticsEventName]: {
    accountId: string;
    eventName: Name;
    occurredAt: Date;
    properties: AnalyticsEventProperties[Name];
    uuid: string;
  };
}[AnalyticsEventName];

export type MultiProfileUsageRetention = number | null | 'not_due';

export type MultiProfileUsageWeek = Readonly<{
  activeAccountCount: number;
  activeUsageRate: number | null;
  averageDirectSwitchesPerActiveAccount: number | null;
  directSwitchCount: number;
  featureRetentionW1: MultiProfileUsageRetention;
  featureRetentionW4: MultiProfileUsageRetention;
  followRelationshipCount: number;
  followRequestCount: number;
  followSucceededCount: number;
  postCreatedCount: number;
  productRetentionW1: MultiProfileUsageRetention;
  productRetentionW4: MultiProfileUsageRetention;
  profileCreatedAccountCount: number;
  profileCreatedCount: number;
  reachRate: number | null;
  status: 'complete' | 'future' | 'partial';
  targetWaaCount: number;
  waaCount: number;
  weekKey: string;
}>;

export type MultiProfileUsageAggregation = Readonly<{
  calculatedAt: Date;
  currentWeekKey: string;
  exclusionListVersion: string;
  observedThrough: Date;
  rulesVersion: string;
  weeks: ReadonlyArray<MultiProfileUsageWeek>;
}>;

export type MultiProfileUsageAggregationOptions = Readonly<{
  calculatedAt?: Date;
  excludedAccountIds?: ReadonlySet<string>;
  exclusionListVersion?: string;
  now?: Date;
  observedThrough?: Date;
  rulesVersion?: string;
}>;

type WeeklyState = {
  directSwitchCount: number;
  directSwitchesByAccount: Map<string, number>;
  eligibleAccounts: Set<string>;
  followRelationshipCount: number;
  followRequestCount: number;
  followSucceededCount: number;
  postCreatedCount: number;
  profileCreatedAccounts: Set<string>;
  profileCreatedCount: number;
  usedProfilesByAccount: Map<string, Set<string>>;
  waaAccounts: Set<string>;
};

type DerivedWeeklyState = WeeklyState & {
  activeAccounts: Set<string>;
  targetWaaAccounts: Set<string>;
};

const MULTI_PROFILE_USAGE_RULES_VERSION = 'multi-profile-usage.v1';
const DEFAULT_EXCLUSION_LIST_VERSION = 'managed-exclusion-list';

function createWeeklyState(): WeeklyState {
  return {
    directSwitchCount: 0,
    directSwitchesByAccount: new Map(),
    eligibleAccounts: new Set(),
    followRelationshipCount: 0,
    followRequestCount: 0,
    followSucceededCount: 0,
    postCreatedCount: 0,
    profileCreatedAccounts: new Set(),
    profileCreatedCount: 0,
    usedProfilesByAccount: new Map(),
    waaAccounts: new Set(),
  };
}

function assertValidDate(value: Date, label: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new RangeError(`${label} must be a valid date.`);
  }
}

function addUsedProfile(
  state: WeeklyState,
  accountId: string,
  profileId: string | undefined,
): void {
  if (!profileId) {
    return;
  }

  const profiles = state.usedProfilesByAccount.get(accountId) ?? new Set<string>();
  profiles.add(profileId);
  state.usedProfilesByAccount.set(accountId, profiles);
}

function isWaaEvent(event: MultiProfileUsageEvent): boolean {
  return (
    event.eventName !== 'multi_profile_context_observed' ||
    event.properties.observation_kind === 'screen'
  );
}

function deduplicateUsageEvents(
  events: ReadonlyArray<MultiProfileUsageEvent>,
  excludedAccountIds: ReadonlySet<string>,
): ReadonlyArray<MultiProfileUsageEvent> {
  const uniqueEvents = new Map<string, MultiProfileUsageEvent>();

  for (const event of events) {
    assertValidDate(event.occurredAt, 'Event timestamp');
    if (!event.accountId || excludedAccountIds.has(event.accountId)) {
      continue;
    }

    const key = `${event.accountId}\u0000${event.eventName}\u0000${event.uuid}`;
    const existing = uniqueEvents.get(key);
    if (!existing || event.occurredAt.getTime() < existing.occurredAt.getTime()) {
      uniqueEvents.set(key, event);
    }
  }

  return [...uniqueEvents.values()];
}

function addWeeks(weekKey: string, weeks: number): string {
  const date = new Date(`${weekKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
}

function getPercentage(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : (numerator / denominator) * 100;
}

function getAverage(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function getRetention(
  baseAccounts: ReadonlySet<string>,
  retainedAccounts: ReadonlySet<string>,
  dueWeekKey: string,
  currentWeekKey: string,
): MultiProfileUsageRetention {
  if (dueWeekKey >= currentWeekKey) {
    return 'not_due';
  }
  if (baseAccounts.size === 0) {
    return null;
  }

  let retainedCount = 0;
  for (const accountId of baseAccounts) {
    if (retainedAccounts.has(accountId)) {
      retainedCount += 1;
    }
  }
  return getPercentage(retainedCount, baseAccounts.size);
}

function getActiveAccounts(state: WeeklyState): Set<string> {
  const activeAccounts = new Set<string>();
  for (const accountId of state.eligibleAccounts) {
    if (!state.waaAccounts.has(accountId)) {
      continue;
    }
    if ((state.usedProfilesByAccount.get(accountId)?.size ?? 0) >= 2) {
      activeAccounts.add(accountId);
    }
  }
  return activeAccounts;
}

export function calculateMultiProfileUsage(
  events: ReadonlyArray<MultiProfileUsageEvent>,
  options: MultiProfileUsageAggregationOptions = {},
): MultiProfileUsageAggregation {
  const now = options.now ?? new Date();
  const calculatedAt = options.calculatedAt ?? now;
  const observedThrough = options.observedThrough ?? now;
  assertValidDate(now, 'Aggregation time');
  assertValidDate(calculatedAt, 'Calculation time');
  assertValidDate(observedThrough, 'Observed-through time');

  const currentWeekKey = getKstWeekKey(now);
  const weeklyStates = new Map<string, WeeklyState>();
  const uniqueEvents = deduplicateUsageEvents(events, options.excludedAccountIds ?? new Set());

  for (const event of uniqueEvents) {
    const weekKey = getKstWeekKey(event.occurredAt);
    const state = weeklyStates.get(weekKey) ?? createWeeklyState();
    weeklyStates.set(weekKey, state);

    if (isWaaEvent(event)) {
      state.waaAccounts.add(event.accountId);
    }

    switch (event.eventName) {
      case 'multi_profile_context_observed':
        if (event.properties.multi_profile_eligible) {
          state.eligibleAccounts.add(event.accountId);
        }
        if (event.properties.observation_kind === 'screen') {
          addUsedProfile(state, event.accountId, event.properties.selected_profile_id);
        }
        break;
      case 'profile_created':
        state.profileCreatedCount += 1;
        state.profileCreatedAccounts.add(event.accountId);
        break;
      case 'profile_selected':
        addUsedProfile(state, event.accountId, event.properties.selected_profile_id);
        break;
      case 'profile_switched':
        addUsedProfile(state, event.accountId, event.properties.selected_profile_id);
        state.directSwitchCount += 1;
        state.directSwitchesByAccount.set(
          event.accountId,
          (state.directSwitchesByAccount.get(event.accountId) ?? 0) + 1,
        );
        break;
      case 'post_created':
        addUsedProfile(state, event.accountId, event.properties.selected_profile_id);
        state.postCreatedCount += 1;
        break;
      case 'follow_succeeded':
        addUsedProfile(state, event.accountId, event.properties.selected_profile_id);
        state.followSucceededCount += 1;
        if (event.properties.result === 'request') {
          state.followRequestCount += 1;
        } else {
          state.followRelationshipCount += 1;
        }
        break;
      case 'search_submitted':
      case 'search_results_loaded':
      case 'search_result_selected':
        break;
    }
  }

  const derivedStates = new Map<string, DerivedWeeklyState>();
  for (const [weekKey, state] of weeklyStates) {
    const targetWaaAccounts = new Set(
      [...state.eligibleAccounts].filter((accountId) => state.waaAccounts.has(accountId)),
    );
    derivedStates.set(weekKey, {
      ...state,
      activeAccounts: getActiveAccounts(state),
      targetWaaAccounts,
    });
  }

  const weeks = [...derivedStates.keys()].sort().map((weekKey) => {
    const state = derivedStates.get(weekKey);
    if (!state) {
      throw new Error(`Missing weekly state for ${weekKey}.`);
    }

    const activeSwitchCount = [...state.activeAccounts].reduce(
      (total, accountId) => total + (state.directSwitchesByAccount.get(accountId) ?? 0),
      0,
    );
    const nextWeek = derivedStates.get(addWeeks(weekKey, 1));
    const fourthWeek = derivedStates.get(addWeeks(weekKey, 4));
    const status =
      weekKey === currentWeekKey ? 'partial' : weekKey < currentWeekKey ? 'complete' : 'future';

    return {
      activeAccountCount: state.activeAccounts.size,
      activeUsageRate: getPercentage(state.activeAccounts.size, state.targetWaaAccounts.size),
      averageDirectSwitchesPerActiveAccount: getAverage(
        activeSwitchCount,
        state.activeAccounts.size,
      ),
      directSwitchCount: state.directSwitchCount,
      featureRetentionW1: getRetention(
        state.activeAccounts,
        nextWeek?.activeAccounts ?? new Set(),
        addWeeks(weekKey, 1),
        currentWeekKey,
      ),
      featureRetentionW4: getRetention(
        state.activeAccounts,
        fourthWeek?.activeAccounts ?? new Set(),
        addWeeks(weekKey, 4),
        currentWeekKey,
      ),
      followRelationshipCount: state.followRelationshipCount,
      followRequestCount: state.followRequestCount,
      followSucceededCount: state.followSucceededCount,
      postCreatedCount: state.postCreatedCount,
      productRetentionW1: getRetention(
        state.targetWaaAccounts,
        nextWeek?.waaAccounts ?? new Set(),
        addWeeks(weekKey, 1),
        currentWeekKey,
      ),
      productRetentionW4: getRetention(
        state.targetWaaAccounts,
        fourthWeek?.waaAccounts ?? new Set(),
        addWeeks(weekKey, 4),
        currentWeekKey,
      ),
      profileCreatedAccountCount: state.profileCreatedAccounts.size,
      profileCreatedCount: state.profileCreatedCount,
      reachRate: getPercentage(state.activeAccounts.size, state.waaAccounts.size),
      status,
      targetWaaCount: state.targetWaaAccounts.size,
      waaCount: state.waaAccounts.size,
      weekKey,
    } satisfies MultiProfileUsageWeek;
  });

  return {
    calculatedAt,
    currentWeekKey,
    exclusionListVersion: options.exclusionListVersion ?? DEFAULT_EXCLUSION_LIST_VERSION,
    observedThrough,
    rulesVersion: options.rulesVersion ?? MULTI_PROFILE_USAGE_RULES_VERSION,
    weeks,
  };
}
