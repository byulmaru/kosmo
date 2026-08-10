export function getBuildVersionLabel(releaseTag: string | undefined): string {
  return releaseTag || '개발 빌드';
}

export const buildVersionLabel = getBuildVersionLabel(process.env.EXPO_PUBLIC_RELEASE_TAG);
