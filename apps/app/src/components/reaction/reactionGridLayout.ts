export function getMobileReactionGridLayout(availableWidth: number, fontScale: number) {
  const targetSize = 48 * Math.max(1, fontScale);
  return { columns: Math.max(1, Math.floor(availableWidth / targetSize)), targetSize };
}
