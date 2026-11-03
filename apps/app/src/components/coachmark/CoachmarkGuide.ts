export const CoachmarkGuide = {
  TIMELINE: 'TIMELINE',
  SEARCH: 'SEARCH',
  TAG: 'TAG',
  PROFILE: 'PROFILE',
  POST: 'POST',
  COMPOSER: 'COMPOSER',
} as const;

export type CoachmarkGuide = keyof typeof CoachmarkGuide;

export const CoachmarkMetadataKey: Record<CoachmarkGuide, string> = {
  TIMELINE: 'coachmark.timeline.shown',
  SEARCH: 'coachmark.search.shown',
  TAG: 'coachmark.tag.shown',
  PROFILE: 'coachmark.profile.shown',
  POST: 'coachmark.post.shown',
  COMPOSER: 'coachmark.composer.shown',
};
