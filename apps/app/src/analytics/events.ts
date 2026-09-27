export type AnalyticsEventProperties = {
  profile_view_succeeded: Record<string, never>;
  profile_created: { selected_profile_id: string };
  profile_selected: {
    selected_profile_id: string;
    selection_cause?: 'auto' | 'direct';
    previous_profile_id?: string;
  };
  post_created: {
    selected_profile_id: string;
    visibility: 'PUBLIC' | 'UNLISTED' | 'FOLLOWERS' | 'DIRECT';
  };
  repost_succeeded: { result: 'created' | 'removed' };
  reaction_added: ReactionEventProperties;
  reaction_removed: ReactionEventProperties;
  bookmark_added: Record<string, never>;
  bookmark_removed: Record<string, never>;
  follow_succeeded: {
    selected_profile_id: string;
    result: 'follow' | 'request';
  };
  search_submitted: {
    tab: 'popular' | 'latest' | 'media' | 'people';
    source: 'keyboard' | 'tab' | 'recent';
  };
  search_results_loaded: {
    tab: 'popular' | 'latest' | 'media' | 'people';
    has_results: boolean;
  };
  search_result_selected: {
    tab: 'popular' | 'latest' | 'media' | 'people';
  };
};

export type ReactionEventProperties =
  | {
      reaction_type: 'default' | 'custom';
      emoji_kind: 'unicode';
      reaction_emoji_key: string;
    }
  | {
      reaction_type: 'default' | 'custom';
      emoji_kind?: never;
      reaction_emoji_key?: never;
    };

export type AnalyticsEventName = keyof AnalyticsEventProperties;

export type AnalyticsEventArgs = {
  [Name in AnalyticsEventName]: [name: Name, properties: AnalyticsEventProperties[Name]];
}[AnalyticsEventName];

export type ReactionAnalyticsEventArgs = [
  name: 'reaction_added' | 'reaction_removed',
  properties: ReactionEventProperties,
];
