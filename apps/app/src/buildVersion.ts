export function getBuildVersionLabel(releaseTag: string | undefined): string {
  return releaseTag || '개발 빌드';
}
