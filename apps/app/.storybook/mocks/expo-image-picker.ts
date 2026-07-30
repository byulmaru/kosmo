import type { ImagePickerResult } from 'expo-image-picker';

const canceledResult: ImagePickerResult = { assets: null, canceled: true };

let launchCount = 0;
let nextResult: ImagePickerResult | Promise<ImagePickerResult> = canceledResult;

export function getImagePickerLaunchCount() {
  return launchCount;
}

export function resetImagePickerMock() {
  launchCount = 0;
  nextResult = canceledResult;
}

export function setNextImagePickerResult(result: ImagePickerResult | Promise<ImagePickerResult>) {
  nextResult = result;
}

export async function launchImageLibraryAsync() {
  launchCount += 1;
  return nextResult;
}
