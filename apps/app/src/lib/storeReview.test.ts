import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import { Temporal } from 'temporal-polyfill';
import type * as StoreReviewWebModule from './storeReview';
import type * as StoreReviewNativeModule from './storeReview.native';

const LAST_STORE_REVIEW_REQUEST_KEY = 'kosmo:store-review:last-request-at';
const storedValues = new Map<string, string>();

let available = true;
let nativeModuleAvailable = false;
let availabilityError: Error | undefined;
let getItemError: Error | undefined;
let setItemError: Error | undefined;
let reviewRequest: () => Promise<void> = async () => undefined;
let nativeModuleLookups: string[] = [];
let availabilityCalls = 0;
let getItemCalls = 0;
let reviewCalls = 0;
let valueAtReviewRequest: string | null | undefined;

mock.module('@react-native-async-storage/async-storage', {
  exports: {
    default: {
      getItem: async (key: string) => {
        getItemCalls += 1;
        if (getItemError) {
          throw getItemError;
        }
        return storedValues.get(key) ?? null;
      },
      setItem: async (key: string, value: string) => {
        if (setItemError) {
          throw setItemError;
        }
        storedValues.set(key, value);
      },
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module('expo', {
  exports: {
    requireOptionalNativeModule: (moduleName: string) => {
      nativeModuleLookups.push(moduleName);
      if (!nativeModuleAvailable) {
        return null;
      }
      return {
        isAvailableAsync: async () => {
          availabilityCalls += 1;
          if (availabilityError) {
            throw availabilityError;
          }
          return available;
        },
        requestReview: async () => {
          reviewCalls += 1;
          valueAtReviewRequest = storedValues.get(LAST_STORE_REVIEW_REQUEST_KEY) ?? null;
          await reviewRequest();
        },
      };
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

let requestNativeStoreReview: typeof StoreReviewNativeModule.requestStoreReview;
let requestWebStoreReview: typeof StoreReviewWebModule.requestStoreReview;

before(async () => {
  ({ requestStoreReview: requestNativeStoreReview } = await import('./storeReview.native'));
  ({ requestStoreReview: requestWebStoreReview } = await import('./storeReview'));
});

beforeEach(() => {
  storedValues.clear();
  available = true;
  nativeModuleAvailable = true;
  availabilityError = undefined;
  getItemError = undefined;
  setItemError = undefined;
  reviewRequest = async () => undefined;
  nativeModuleLookups = [];
  availabilityCalls = 0;
  getItemCalls = 0;
  reviewCalls = 0;
  valueAtReviewRequest = undefined;
});

describe('native store review adapter', () => {
  it('imports safely and skips storage when the native module is unavailable', async (t) => {
    t.mock.method(Temporal.Now, 'instant', () => Temporal.Instant.from('2026-11-04T12:00:00Z'));
    nativeModuleAvailable = false;

    await requestNativeStoreReview();

    assert.deepEqual(nativeModuleLookups, ['ExpoStoreReview']);
    assert.equal(availabilityCalls, 0);
    assert.equal(getItemCalls, 0);
    assert.equal(storedValues.has(LAST_STORE_REVIEW_REQUEST_KEY), false);
    assert.equal(reviewCalls, 0);
  });

  it('does not read or write storage when the OS says review requests are unavailable', async (t) => {
    t.mock.method(Temporal.Now, 'instant', () => Temporal.Instant.from('2026-11-04T12:00:00Z'));
    available = false;

    await requestNativeStoreReview();

    assert.equal(availabilityCalls, 1);
    assert.equal(getItemCalls, 0);
    assert.equal(storedValues.has(LAST_STORE_REVIEW_REQUEST_KEY), false);
    assert.equal(reviewCalls, 0);
  });

  it('swallows availability API failures without reading or persisting', async (t) => {
    t.mock.method(Temporal.Now, 'instant', () => Temporal.Instant.from('2026-11-04T12:00:00Z'));
    availabilityError = new Error('availability check failed');

    await assert.doesNotReject(requestNativeStoreReview());

    assert.equal(getItemCalls, 0);
    assert.equal(storedValues.has(LAST_STORE_REVIEW_REQUEST_KEY), false);
    assert.equal(reviewCalls, 0);
  });

  it('persists an ISO timestamp before requesting the OS review prompt', async (t) => {
    const now = Temporal.Instant.from('2026-11-04T12:00:00Z');
    t.mock.method(Temporal.Now, 'instant', () => now);

    await requestNativeStoreReview();

    assert.equal(storedValues.get(LAST_STORE_REVIEW_REQUEST_KEY), now.toString());
    assert.equal(valueAtReviewRequest, now.toString());
    assert.equal(reviewCalls, 1);
  });

  it('waits until exactly 120 days have elapsed between request attempts', async (t) => {
    const now = Temporal.Instant.from('2026-11-04T12:00:00Z');
    t.mock.method(Temporal.Now, 'instant', () => now);
    storedValues.set(
      LAST_STORE_REVIEW_REQUEST_KEY,
      now
        .subtract({ hours: 120 * 24 })
        .add({ nanoseconds: 1 })
        .toString(),
    );

    await requestNativeStoreReview();
    assert.equal(reviewCalls, 0);

    storedValues.set(LAST_STORE_REVIEW_REQUEST_KEY, now.subtract({ hours: 120 * 24 }).toString());
    await requestNativeStoreReview();

    assert.equal(reviewCalls, 1);
    assert.equal(storedValues.get(LAST_STORE_REVIEW_REQUEST_KEY), now.toString());
  });

  it('does not request early when the saved timestamp is ahead of the device clock', async (t) => {
    const now = Temporal.Instant.from('2026-11-04T12:00:00Z');
    t.mock.method(Temporal.Now, 'instant', () => now);
    const futureRequestAt = now.add({ hours: 1 }).toString();
    storedValues.set(LAST_STORE_REVIEW_REQUEST_KEY, futureRequestAt);

    await requestNativeStoreReview();

    assert.equal(reviewCalls, 0);
    assert.equal(storedValues.get(LAST_STORE_REVIEW_REQUEST_KEY), futureRequestAt);
  });

  it('fails closed for invalid timestamps and storage read or write errors', async (t) => {
    const now = Temporal.Instant.from('2026-11-04T12:00:00Z');
    t.mock.method(Temporal.Now, 'instant', () => now);
    storedValues.set(LAST_STORE_REVIEW_REQUEST_KEY, 'not-an-instant');

    await requestNativeStoreReview();
    assert.equal(reviewCalls, 0);

    storedValues.delete(LAST_STORE_REVIEW_REQUEST_KEY);
    getItemError = new Error('storage read failed');
    await requestNativeStoreReview();
    assert.equal(reviewCalls, 0);

    getItemError = undefined;
    setItemError = new Error('storage write failed');
    await requestNativeStoreReview();
    assert.equal(reviewCalls, 0);
    assert.equal(storedValues.has(LAST_STORE_REVIEW_REQUEST_KEY), false);
  });

  it('keeps the saved attempt after an OS request failure and resolves without failing the caller', async (t) => {
    const now = Temporal.Instant.from('2026-11-04T12:00:00Z');
    t.mock.method(Temporal.Now, 'instant', () => now);
    reviewRequest = async () => {
      throw new Error('OS request failed');
    };

    await assert.doesNotReject(requestNativeStoreReview());

    assert.equal(storedValues.get(LAST_STORE_REVIEW_REQUEST_KEY), now.toString());
    assert.equal(reviewCalls, 1);

    await requestNativeStoreReview();
    assert.equal(reviewCalls, 1);
  });

  it('ignores overlapping calls while a review request is pending', async (t) => {
    const now = Temporal.Instant.from('2026-11-04T12:00:00Z');
    t.mock.method(Temporal.Now, 'instant', () => now);
    let notifyReviewStarted!: () => void;
    let finishReview!: () => void;
    const reviewStarted = new Promise<void>((resolve) => {
      notifyReviewStarted = resolve;
    });
    const reviewCanFinish = new Promise<void>((resolve) => {
      finishReview = resolve;
    });
    reviewRequest = async () => {
      notifyReviewStarted();
      await reviewCanFinish;
    };

    const firstRequest = requestNativeStoreReview();
    await reviewStarted;
    await requestNativeStoreReview();
    assert.equal(reviewCalls, 1);

    finishReview();
    await firstRequest;
  });
});

describe('web store review adapter', () => {
  it('does nothing', async () => {
    await requestWebStoreReview();

    assert.equal(availabilityCalls, 0);
    assert.deepEqual(nativeModuleLookups, []);
    assert.equal(getItemCalls, 0);
    assert.equal(reviewCalls, 0);
  });
});
