import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentryScope = vi.hoisted(() => ({
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
        enableLogs: true,
        environment: 'production',
        initialScope: { tags: { runtime: 'web-bff' } },
        release: 'kosmo@abc123',
      }),
    );
    expect(sentry.init.mock.calls[0]?.[0].beforeSend).toBeUndefined();

    const beforeSendTransaction = sentry.init.mock.calls[0]?.[0].beforeSendTransaction;
    expect(beforeSendTransaction).toEqual(expect.any(Function));
    if (typeof beforeSendTransaction !== 'function') {
      throw new Error('Sentry did not configure a transaction filter');
    }
    const transactionEvent = {
      type: 'transaction' as const,
      event_id: 'transaction-event',
      transaction: 'POST /graphql',
      request: {
        url: 'https://kosmo.invalid/graphql?request-id=url-query-value',
        method: 'POST',
        headers: {
          aUtHoRiZaTiOn: 'Bearer authorization-value',
          'PrOxY-aUtHoRiZaTiOn': 'Basic proxy-authorization-value',
          cOoKiE: 'kosmo_session=cookie-header-value',
          Accept: 'application/json',
          'X-Request-Id': 'request-id',
        },
        cookies: { kosmo_session: 'parsed-cookie-value', locale: 'ko' },
        data: { retainedBodyMarker: 'request-data-value' },
      },
    };
    const originalRequest = transactionEvent.request;
    const originalHeaders = transactionEvent.request.headers;
    const originalEvent = structuredClone(transactionEvent);
    const filteredEvent = beforeSendTransaction(transactionEvent, {});

    expect(filteredEvent).not.toBeNull();
    expect(filteredEvent).not.toBe(transactionEvent);
    expect(filteredEvent?.request).not.toBe(transactionEvent.request);
    expect(filteredEvent?.request?.headers).not.toBe(transactionEvent.request.headers);
    expect(filteredEvent?.request?.headers).toEqual({
      Accept: 'application/json',
      'X-Request-Id': 'request-id',
    });
    expect(filteredEvent?.request?.cookies).toBeUndefined();
    expect(filteredEvent?.request?.url).toBe(transactionEvent.request.url);
    expect(filteredEvent?.request?.data).toEqual(transactionEvent.request.data);
    expect(filteredEvent?.transaction).toBe(transactionEvent.transaction);
    expect(transactionEvent.request).toBe(originalRequest);
    expect(transactionEvent.request.headers).toBe(originalHeaders);
    expect(transactionEvent).toEqual(originalEvent);
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
