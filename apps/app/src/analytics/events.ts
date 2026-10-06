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
  profile_hashtag_clicked: { hashtag_id: string };
  profile_hashtag_list_viewed: { hashtag_id: string; result_count: number };
  profile_hashtag_profile_selected: { hashtag_id: string };
};

export type AnalyticsEventName = keyof AnalyticsEventProperties;

export type AnalyticsEventArgs = {
  [Name in AnalyticsEventName]: [name: Name, properties: AnalyticsEventProperties[Name]];
}[AnalyticsEventName];
