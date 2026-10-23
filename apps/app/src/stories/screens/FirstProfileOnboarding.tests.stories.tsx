import meta, {
  HandleOnlyCompletion as HandleOnlyCompletionStory,
  OptionalFailureCanSkip as OptionalFailureCanSkipStory,
  OptionalStepsAndSkip as OptionalStepsAndSkipStory,
  UnavailableSummaryCanComplete as UnavailableSummaryCanCompleteStory,
} from './FirstProfileOnboarding.stories';

export default {
  ...meta,
  excludeStories: [],
  parameters: { ...meta.parameters, controls: { disable: true } },
  title: 'KOSMO/Screens/First Profile Onboarding/Tests',
};

export const OptionalStepsAndSkip = OptionalStepsAndSkipStory;
export const HandleOnlyCompletion = HandleOnlyCompletionStory;
export const OptionalFailureCanSkip = OptionalFailureCanSkipStory;

export const UnavailableSummaryCanComplete = UnavailableSummaryCanCompleteStory;
