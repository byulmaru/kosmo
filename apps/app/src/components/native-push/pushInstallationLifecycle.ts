export async function syncPushInstallationToken({
  installationId,
  registerInstallation,
  token,
  updateInstallation,
}: {
  installationId: string | null;
  registerInstallation: (token: string) => Promise<string>;
  token: string;
  updateInstallation: (id: string, token: string) => Promise<void>;
}): Promise<string> {
  if (installationId) {
    try {
      await updateInstallation(installationId, token);
      return installationId;
    } catch {
      // ponytail: any update error may reset the epoch; classify errors if strict epochs are required.
    }
  }

  return registerInstallation(token);
}

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
