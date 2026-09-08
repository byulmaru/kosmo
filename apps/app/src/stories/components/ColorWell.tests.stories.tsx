import baseMeta, { InteractionContract as interactionContract } from './ColorWell.stories';

export default {
  ...baseMeta,
  excludeStories: [],
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Color Well/Tests',
};

export const InteractionContract = interactionContract;
export const DarkInteractionContract = { ...interactionContract, globals: { theme: 'dark' } };
