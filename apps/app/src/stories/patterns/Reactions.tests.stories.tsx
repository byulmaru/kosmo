import { expect, waitFor, within } from 'storybook/test';
import baseMeta, {
  emptyReactionSummaryPost,
  EmptyReactionSummaryReadyStory,
} from './Reactions.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  parameters: {
    controls: { disable: true },
    relay: {
      operationResponses: {
        ReactionsIntegrationStoriesQuery: {
          data: {
            node: emptyReactionSummaryPost,
          },
        },
      },
    },
  },
  title: 'KOSMO/Patterns/Reaction/Catalog/Tests',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ZeroCountSummaryReportsReady: Story = {
  render: () => <EmptyReactionSummaryReadyStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.queryByTestId('reaction-summary-row')).not.toBeInTheDocument();
    expect(canvas.queryByRole('link', { name: /반응한 프로필 보기/ })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(canvas.getByTestId('reaction-summary-ready')).toHaveTextContent('ready'),
    );
  },
};
