import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentryScope = vi.hoisted(() => ({
  addEventProcessor: vi.fn(),
  setExtras: vi.fn(),
  setFingerprint: vi.fn(),
  setTags: vi.fn(),
}));
const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  init: vi.fn(),
  metrics: { count: vi.fn() },
  withScope: vi.fn(),
}));

vi.mock('@sentry/node', () => sentry);

beforeEach(() => {
  vi.resetModules();
  sentry.init.mockReset();
  sentry.captureException.mockReset();
  sentry.metrics.count.mockReset();
  sentry.withScope.mockReset();
  sentryScope.addEventProcessor.mockReset();
  sentryScope.setExtras.mockReset();
  sentryScope.setFingerprint.mockReset();
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
    expect(sentryScope.addEventProcessor).not.toHaveBeenCalled();
    expect(sentry.captureException).toHaveBeenCalledWith(error);
  });

  it('omits automatic request data only from inbox authentication captures', async () => {
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', 'https://public@example.invalid/1');
    vi.stubEnv('ENVIRONMENT', 'production');
    vi.stubEnv('SENTRY_RELEASE', 'kosmo@abc123');

    const { captureUnexpectedError } = await import('./sentry');
    captureUnexpectedError(new Error('inbox_authentication_verification_failed'), {
      tags: {
        handler: 'listener',
        outcome: 'rejected',
        phase: 'authentication',
        reason_code: 'inbox_authentication_verification_failed',
      },
      fingerprint: [
        'activitypub-inbound',
        'Unknown',
        'listener',
        'authentication',
        'inbox_authentication_verification_failed',
      ],
    });

    const event = {
      contexts: { runtime: { name: 'node' } },
      debug_meta: { images: [] },
      exception: { values: [{ type: 'Error', value: 'inbox_authentication_verification_failed' }] },
      release: 'kosmo@abc123',
      request: { data: 'raw body', headers: { signature: 'raw signature' } },
      tags: { outcome: 'rejected', phase: 'authentication' },
    };
    const processEvent = sentryScope.addEventProcessor.mock.calls[0]?.[0] as (
      event: Record<string, unknown>,
    ) => Record<string, unknown>;

    expect(sentryScope.addEventProcessor).toHaveBeenCalledOnce();
    expect(processEvent(event)).toEqual({
      contexts: event.contexts,
      debug_meta: event.debug_meta,
      exception: event.exception,
      release: event.release,
      tags: event.tags,
    });
  });

  it('counts an inbound metric with fixed bounded attributes', async () => {
    vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', 'https://public@example.invalid/1');
    vi.stubEnv('ENVIRONMENT', 'production');
    vi.stubEnv('SENTRY_RELEASE', 'kosmo@abc123');

    const { countMetric } = await import('./sentry');
    countMetric('activitypub.inbound.note_content_length_exceeded', {
      activity_type: 'Create',
      handler: 'create',
      outcome: 'rejected',
      phase: 'projection',
      reason_code: 'note_content_length_exceeded',
    });

    expect(sentry.metrics.count).toHaveBeenCalledOnce();
    expect(sentry.metrics.count).toHaveBeenCalledWith(
      'activitypub.inbound.note_content_length_exceeded',
      1,
      {
        attributes: {
          activity_type: 'Create',
          handler: 'create',
          outcome: 'rejected',
          phase: 'projection',
          reason_code: 'note_content_length_exceeded',
        },
      },
    );
  });
});
