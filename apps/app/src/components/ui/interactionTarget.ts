export function getInteractionTargetSize(platform: string): number {
  return platform === 'web' ? 32 : platform === 'ios' ? 44 : 48;
}
