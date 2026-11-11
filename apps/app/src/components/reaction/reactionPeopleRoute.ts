import type { Href } from 'expo-router';
import type { ReactionSummaryEntry } from './ReactionSummary';

export function resolveReactionPeopleType(
  entries: ReadonlyArray<ReactionSummaryEntry>,
  requestedType?: string | null,
): string | null {
  const positiveEntries = entries.filter((entry) => entry.count > 0);
  return (
    positiveEntries.find((entry) => entry.type === requestedType)?.type ??
    positiveEntries[0]?.type ??
    null
  );
}

export function getReactionPeopleHref(
  relativeHandle: string,
  postSlug: string,
  reactionType?: string | null,
): Href {
  const query = reactionType ? `?type=${encodeURIComponent(reactionType)}` : '';
  return `/${relativeHandle}/${postSlug}/reactions${query}` as Href;
}
