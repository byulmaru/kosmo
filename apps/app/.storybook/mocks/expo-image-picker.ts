export async function requestMediaLibraryPermissionsAsync() {
  return { granted: true };
}

export async function launchImageLibraryAsync() {
  return { assets: null, canceled: true };
}
