export type AnalyticsEventProperties = {
  profile_view_succeeded: Record<string, never>;
  multi_profile_context_observed:
    | {
        observation_kind: 'screen';
        available_profile_count?: number;
        selected_profile_id?: string;
      }
    | {
        observation_kind: 'availability';
        available_profile_count: number;
      };
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
    selected_profile_id?: string;
    tab: 'popular' | 'latest' | 'media' | 'people';
    source: 'keyboard' | 'tab' | 'recent';
  };
  search_results_loaded: {
    selected_profile_id?: string;
    tab: 'popular' | 'latest' | 'media' | 'people';
    has_results: boolean;
  };
  search_result_selected: {
    selected_profile_id?: string;
    tab: 'popular' | 'latest' | 'media' | 'people';
  };
};

export type AnalyticsEventName = keyof AnalyticsEventProperties;

export type AnalyticsCaptureOptions = {
  accountId?: string;
  uuid?: string;
  timestamp?: Date;
};

export type AnalyticsEventArgs = {
  [Name in AnalyticsEventName]: [
    name: Name,
    properties: AnalyticsEventProperties[Name],
    options?: AnalyticsCaptureOptions,
  ];
}[AnalyticsEventName];
