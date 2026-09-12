export type ReactionSummaryLayout = Readonly<{
  hiddenCount: number;
  visibleCount: number;
}>;

type ReactionSummaryLayoutInput = Readonly<{
  availableWidth: number;
  entryWidths: readonly number[];
  ellipsisWidth: number;
  gap: number;
  overflowWidths: Readonly<Record<number, number>>;
}>;

export function getReactionSummaryLayout({
  availableWidth,
  entryWidths,
  ellipsisWidth,
  gap,
  overflowWidths,
}: ReactionSummaryLayoutInput): ReactionSummaryLayout {
  const widthFor = (visibleCount: number, trailingWidth: number) =>
    entryWidths.slice(0, visibleCount).reduce((total, width) => total + width, trailingWidth) +
    gap * visibleCount;

  if (widthFor(entryWidths.length, ellipsisWidth) <= availableWidth) {
    return { hiddenCount: 0, visibleCount: entryWidths.length };
  }

  for (let visibleCount = entryWidths.length - 1; visibleCount >= 0; visibleCount -= 1) {
    const hiddenCount = entryWidths.length - visibleCount;
    const trailingWidth = overflowWidths[hiddenCount];
    if (trailingWidth !== undefined && widthFor(visibleCount, trailingWidth) <= availableWidth) {
      return { hiddenCount, visibleCount };
    }
  }

  return { hiddenCount: entryWidths.length, visibleCount: 0 };
}
