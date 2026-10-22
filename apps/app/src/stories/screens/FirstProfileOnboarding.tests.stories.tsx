import meta, {
  DraftSurvivesStepsAndSkip as DraftSurvivesStepsAndSkipStory,
  HandleOnlyCompletionAndReturn as HandleOnlyCompletionAndReturnStory,
  OptionalFailureCanSkip as OptionalFailureCanSkipStory,
  UnavailableSummaryCanComplete as UnavailableSummaryCanCompleteStory,
} from './FirstProfileOnboarding.stories';

export default {
  ...meta,
  excludeStories: [],
  parameters: { ...meta.parameters, controls: { disable: true } },
  title: 'KOSMO/Screens/First Profile Onboarding/Tests',
};

export const DraftSurvivesStepsAndSkip = DraftSurvivesStepsAndSkipStory;
export const HandleOnlyCompletionAndReturn = HandleOnlyCompletionAndReturnStory;
export const OptionalFailureCanSkip = OptionalFailureCanSkipStory;

export const UnavailableSummaryCanComplete = UnavailableSummaryCanCompleteStory;
