import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentryScope = vi.hoisted(() => ({
  setExtra: vi.fn(),
  setExtras: vi.fn(),
  setFingerprint: vi.fn(),
  setTag: vi.fn(),
  setTags: vi.fn(),
}));
const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  init: vi.fn(),
  withScope: vi.fn(),
}));

vi.mock('@sentry/node', () => sentry);

beforeEach(() => {
  vi.resetModules();
  sentry.init.mockReset();
  sentry.captureException.mockReset();
  sentry.withScope.mockReset();
  sentryScope.setExtra.mockReset();
  sentryScope.setExtras.mockReset();
  sentryScope.setFingerprint.mockReset();
  sentryScope.setTag.mockReset();
  sentryScope.setTags.mockReset();
  sentry.withScope.mockImplementation((callback) => callback(sentryScope));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Web BFF Sentry configuration', () => {
  it('does not initialize without deployment metadata', async () => {
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', undefined);
    vi.stubEnv('ENVIRONMENT', undefined);
    vi.stubEnv('SENTRY_RELEASE', undefined);

    await import('./sentry');

    expect(sentry.init).not.toHaveBeenCalled();
  });

  it('initializes with complete deployment metadata', async () => {
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', 'https://public@example.invalid/1');
    vi.stubEnv('ENVIRONMENT', 'production');
    vi.stubEnv('SENTRY_RELEASE', 'kosmo@abc123');

    await import('./sentry');

    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'production',
        initialScope: { tags: { runtime: 'web-bff' } },
        release: 'kosmo@abc123',
      }),
    );
    expect(sentry.init.mock.calls[0]?.[0].beforeSend).toBeUndefined();
  });

  it('reports notification effect failures with the minimal context', async () => {
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', 'https://public@example.invalid/1');
    vi.stubEnv('ENVIRONMENT', 'production');
    vi.stubEnv('SENTRY_RELEASE', 'kosmo@abc123');

    const { captureNotificationEffectError } = await import('./sentry');
    const cause = new Error('notification delete failed');

    captureNotificationEffectError(cause, {
      operation: 'delete',
      notificationKind: 'FOLLOW_REQUEST',
      sourceId: 'request-123',
    });

    expect(sentry.withScope).toHaveBeenCalledOnce();
    expect(sentryScope.setTag).toHaveBeenCalledTimes(2);
    expect(sentryScope.setTag).toHaveBeenNthCalledWith(1, 'operation', 'delete');
    expect(sentryScope.setTag).toHaveBeenNthCalledWith(2, 'notificationKind', 'FOLLOW_REQUEST');
    expect(sentryScope.setExtra).toHaveBeenCalledTimes(1);
    expect(sentryScope.setExtra).toHaveBeenCalledWith('sourceId', 'request-123');
    expect(sentry.captureException).toHaveBeenCalledOnce();
    expect(sentry.captureException).toHaveBeenCalledWith(cause);
  });

  it('adds bounded inbound grouping metadata to internal captures', async () => {
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', 'https://public@example.invalid/1');
    vi.stubEnv('ENVIRONMENT', 'production');
    vi.stubEnv('SENTRY_RELEASE', 'kosmo@abc123');

    const { captureUnexpectedError } = await import('./sentry');
    const error = new Error('projection failed');
    captureUnexpectedError(error, {
      tags: {
        activity_type: 'Create',
        handler: 'create',
        outcome: 'internal_failure',
        phase: 'projection',
        reason_code: 'projection_failed',
      },
      fingerprint: ['activitypub-inbound', 'Create', 'create', 'projection', 'projection_failed'],
    });

    expect(sentry.withScope).toHaveBeenCalledOnce();
    expect(sentryScope.setTags).toHaveBeenCalledWith({
      activity_type: 'Create',
      handler: 'create',
      outcome: 'internal_failure',
      phase: 'projection',
      reason_code: 'projection_failed',
    });
    expect(sentryScope.setFingerprint).toHaveBeenCalledWith([
      'activitypub-inbound',
      'Create',
      'create',
      'projection',
      'projection_failed',
    ]);
    expect(sentry.captureException).toHaveBeenCalledWith(error);
  });
});
