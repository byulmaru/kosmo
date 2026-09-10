import baseMeta, {
  InteractionContract as interactionContract,
  OpenContract as openContract,
} from './SelectTrigger.stories';

export default {
  ...baseMeta,
  excludeStories: [],
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Select Trigger/Tests',
};

export const InteractionContract = interactionContract;
export const DarkInteractionContract = { ...interactionContract, globals: { theme: 'dark' } };
export const OpenContract = openContract;
