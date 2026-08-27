export type AnalyticsEventProperties = {
  $pageview: { $pathname: string };
  profile_created: { selected_profile_id: string };
  profile_selected: { selected_profile_id: string };
  post_created: {
    selected_profile_id: string;
    visibility: 'PUBLIC' | 'UNLISTED' | 'FOLLOWERS' | 'DIRECT';
  };
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

export function encodeAnalyticsEvent(...args: AnalyticsEventArgs) {
  switch (args[0]) {
    case '$pageview':
      return { name: args[0], properties: { $pathname: args[1].$pathname } };
    case 'profile_created':
    case 'profile_selected':
      return {
        name: args[0],
        properties: { selected_profile_id: args[1].selected_profile_id },
      };
    case 'post_created':
      return {
        name: args[0],
        properties: {
          selected_profile_id: args[1].selected_profile_id,
          visibility: args[1].visibility,
        },
      };
    case 'follow_succeeded':
      return {
        name: args[0],
        properties: {
          selected_profile_id: args[1].selected_profile_id,
          result: args[1].result,
        },
      };
    case 'search_submitted':
      return {
        name: args[0],
        properties: { tab: args[1].tab, source: args[1].source },
      };
    case 'search_results_loaded':
      return {
        name: args[0],
        properties: { tab: args[1].tab, has_results: args[1].has_results },
      };
    case 'search_result_selected':
      return { name: args[0], properties: { tab: args[1].tab } };
  }
}
