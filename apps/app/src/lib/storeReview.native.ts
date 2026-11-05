import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import { Temporal } from 'temporal-polyfill';

const LAST_STORE_REVIEW_REQUEST_KEY = 'kosmo:store-review:last-request-at';
const STORE_REVIEW_COOLDOWN_HOURS = 120 * 24;

type StoreReviewNativeModule = {
  isAvailableAsync: () => Promise<boolean>;
  requestReview: () => Promise<void>;
};

let requestInFlight = false;

export async function requestStoreReview(): Promise<void> {
  if (requestInFlight) {
    return;
  }
  requestInFlight = true;

  try {
    // The Expo wrapper eagerly requires this module; optional lookup keeps old OTA binaries safe.
    const storeReview = requireOptionalNativeModule<StoreReviewNativeModule>('ExpoStoreReview');
    if (!storeReview || !(await storeReview.isAvailableAsync())) {
      return;
    }

    const lastRequestAt = await AsyncStorage.getItem(LAST_STORE_REVIEW_REQUEST_KEY);
    const now = Temporal.Now.instant();
    if (
      lastRequestAt !== null &&
      Temporal.Instant.compare(
        Temporal.Instant.from(lastRequestAt).add({ hours: STORE_REVIEW_COOLDOWN_HOURS }),
        now,
      ) > 0
    ) {
      return;
    }

    // Record before calling the OS because it may silently suppress the prompt.
    await AsyncStorage.setItem(LAST_STORE_REVIEW_REQUEST_KEY, now.toString());
    await storeReview.requestReview();
  } catch {
    // Rating must not affect the post flow; storage failures stop before the OS request.
  } finally {
    requestInFlight = false;
  }
}
