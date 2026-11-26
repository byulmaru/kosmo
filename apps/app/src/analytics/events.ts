export type AnalyticsEventProperties = {
  profile_view_succeeded: Record<string, never>;
  profile_created: {
    selected_profile_id: string;
    flow_id?: string;
    action_sequence?: number;
    operation_attempt?: number;
  };
  profile_selected: {
    selected_profile_id: string;
    selection_cause?: 'auto' | 'direct';
    previous_profile_id?: string;
    flow_id?: string;
    action_sequence?: number;
    operation_attempt?: number;
  };
  post_created: {
    ai_prohibit_image_count: number;
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
    flow_id?: string;
    action_sequence?: number;
    operation_attempt?: number;
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
  first_profile_onboarding_started: { flow_id: string };
  first_profile_onboarding_step_viewed: {
    flow_id: string;
    step: FirstProfileOnboardingStep;
    visit_sequence: number;
  };
  first_profile_onboarding_action: {
    flow_id: string;
    step: FirstProfileOnboardingStep;
    action: FirstProfileOnboardingAction;
    action_sequence: number;
    tag_index?: number;
  };
  first_profile_onboarding_operation: {
    flow_id: string;
    step: FirstProfileOnboardingStep;
    operation: FirstProfileOnboardingOperation;
    result: 'succeeded' | 'failed' | 'not_observed';
    operation_attempt: number;
    action_sequence?: number;
    tag_index?: number;
    error_type?: 'validation' | 'network' | 'response' | 'media' | 'unknown';
  };
  first_profile_onboarding_discovery: {
    flow_id: string;
    stage: 'saved_tags' | 'related_profiles';
    result: 'loaded' | 'empty' | 'failed';
    saved_tag_count_status?: 'known' | 'unknown';
    saved_tag_count?: number;
    tag_index?: number;
    result_count?: number;
  };
  first_profile_onboarding_completed: {
    flow_id: string;
    exit_reason: 'no_saved_tags' | 'continued';
    saved_tag_count_status: 'known' | 'unknown';
    saved_tag_count?: number;
    follow_relationship_count: number;
    follow_request_count: number;
    follow_operation_pending_count: number;
    operation_pending_count: number;
  };
  first_profile_onboarding_home_viewed: { flow_id: string };
};

export type FirstProfileOnboardingStep =
  | 'handle'
  | 'details'
  | 'tags'
  | 'posting'
  | 'review'
  | 'discovery';

export type FirstProfileOnboardingAction =
  | 'next'
  | 'save'
  | 'skip'
  | 'start_now'
  | 'continue'
  | 'retry'
  | 'select_tag'
  | 'follow'
  | 'unfollow'
  | 'cancel_request';

export type FirstProfileOnboardingOperation =
  | 'create_profile'
  | 'select_profile'
  | 'save_profile'
  | 'upload_profile_image'
  | 'load_saved_tags'
  | 'load_related_profiles'
  | 'load_more_related_profiles'
  | 'follow_profile'
  | 'unfollow_profile'
  | 'cancel_follow_request';

export type AnalyticsEventName = keyof AnalyticsEventProperties;

export type AnalyticsEventArgs = {
  [Name in AnalyticsEventName]: [name: Name, properties: AnalyticsEventProperties[Name]];
}[AnalyticsEventName];
