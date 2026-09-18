export type AnalyticsEventProperties = {
  profile_created: { selected_profile_id: string };
  profile_selected: { selected_profile_id: string };
  post_created: {
    selected_profile_id: string;
    visibility: 'PUBLIC' | 'UNLISTED' | 'FOLLOWERS' | 'DIRECT';
  };
  repost_succeeded: { result: 'created' | 'removed' };
  reaction_added: { reaction_type: 'default' | 'custom' };
  reaction_removed: { reaction_type: 'default' | 'custom' };
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

export type AnalyticsEventName = keyof AnalyticsEventProperties;

export type AnalyticsEventArgs = {
  [Name in AnalyticsEventName]: [name: Name, properties: AnalyticsEventProperties[Name]];
}[AnalyticsEventName];
