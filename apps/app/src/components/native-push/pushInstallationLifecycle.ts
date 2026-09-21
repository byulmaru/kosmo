export async function unregisterDeniedPushInstallation({
  deleteInstallationId,
  installationId,
  unregisterInstallation,
}: {
  deleteInstallationId: () => Promise<void>;
  installationId: string | null;
  unregisterInstallation: (id: string) => Promise<void>;
}): Promise<boolean> {
  if (!installationId) {
    return false;
  }

  await unregisterInstallation(installationId);
  await deleteInstallationId();
  return true;
}
