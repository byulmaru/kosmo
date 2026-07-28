export type LogoutFlowDependencies = {
  clearNativeSession: () => Promise<void>;
  replaceWithRoot: () => void;
  requestNativeLogout: () => Promise<void>;
  requestWebLogout: () => Promise<void>;
  resetWebActor: () => void;
  runtime: 'native' | 'web';
};

export async function executeLogoutFlow({
  clearNativeSession,
  replaceWithRoot,
  requestNativeLogout,
  requestWebLogout,
  resetWebActor,
  runtime,
}: LogoutFlowDependencies): Promise<void> {
  if (runtime === 'web') {
    await requestWebLogout();
    resetWebActor();
  } else {
    await requestNativeLogout();
    await clearNativeSession();
  }

  replaceWithRoot();
}
