export function getMobileReactionGridLayout(availableWidth: number, fontScale: number) {
  const targetSize = 48 * Math.max(1, fontScale);
  const columns = Math.max(1, Math.floor(availableWidth / targetSize));
  const columnGap =
    columns > 1 ? Math.max(0, (availableWidth - columns * targetSize) / (columns - 1)) : 0;
  return { columns, columnGap, targetSize };
}
