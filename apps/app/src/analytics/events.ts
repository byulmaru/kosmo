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
    post_type: 'post' | 'reply' | 'quote';
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
  follow_removed: { result: 'unfollow' | 'request_cancelled' };
  follow_request_responded: { result: 'accepted' | 'rejected' };
  profile_blocked: Record<string, never>;
  profile_unblocked: Record<string, never>;
  profile_muted: Record<string, never>;
  profile_unmuted: Record<string, never>;
  post_pinned: Record<string, never>;
  post_unpinned: Record<string, never>;
  profile_tag_muted: Record<string, never>;
  profile_tag_unmuted: Record<string, never>;
  post_deleted: Record<string, never>;
  notification_opened: {
    kind:
      | 'follow'
      | 'followRequest'
      | 'reaction'
      | 'reply'
      | 'quote'
      | 'repost'
      | 'mention'
      | 'operational';
  };
  notifications_read: { scope: 'single' | 'all' };
  content_report_submitted: Record<string, never>;
  feedback_submitted: Record<string, never>;
  profile_updated: Record<string, never>;
  profile_deleted: Record<string, never>;
  profile_migration_requested: {
    action: 'source_registered' | 'source_unregistered';
  };
  following_import_requested: Record<string, never>;
  theme_changed: { preference: 'system' | 'light' | 'dark' };
  link_copied: { target: 'post' | 'profile' };
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
