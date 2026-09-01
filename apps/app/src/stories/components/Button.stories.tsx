import { expect, fn, userEvent, within } from 'storybook/test';
import { Button } from '@/components/ui/Button';
import { Catalog, Row, Section } from '../StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  args: {
    children: '버튼',
    disabled: false,
    loading: false,
    loadingText: '처리 중',
    onPress: fn(),
    size: 'default',
    tone: 'primary',
  },
  argTypes: {
    size: {
      control: 'select',
      description: '`compact`는 Web Post Composer footer 전용이며 Native에서는 사용하지 않습니다.',
      options: ['default', 'compact'],
    },
    tone: { control: 'select', options: ['primary', 'secondary', 'danger'] },
  },
  component: Button,
  excludeStories: ['InteractionContract'],
  parameters: { controls: { disable: true } },
  title: 'KOSMO/Components/Button',
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  parameters: {
    controls: {
      disable: false,
      include: ['children', 'disabled', 'loading', 'loadingText', 'size', 'tone'],
    },
  },
  render: (args) => <Button {...args} style={{ alignSelf: 'flex-start' }} />,
};

export const InteractionContract: Story = {
  args: {
    children: '버튼',
    disabled: false,
    loading: false,
    loadingText: '처리 중',
    size: 'default',
    tone: 'primary',
  },
  render: (args) => <Button {...args} style={{ alignSelf: 'flex-start' }} />,
  play: async ({ args, canvasElement, step }) => {
    args.onPress?.mockClear();
    const button = within(canvasElement).getByRole('button', { name: String(args.children) });

    await step('버튼 상태와 callback 확인', async () => {
      if (args.disabled || args.loading) {
        expect(button).toBeDisabled();
        button.click();
        expect(args.onPress).not.toHaveBeenCalled();
        return;
      }
      await userEvent.click(button);
      expect(args.onPress).toHaveBeenCalledOnce();
    });
  },
};

export const RepresentativeStates: Story = {
  render: () => (
    <Catalog>
      <Section title="Sizes and tones">
        <Row>
          <Button>기본</Button>
          <Button tone="secondary">보조</Button>
          <Button tone="danger">위험</Button>
          <Button size="compact">기본 Compact</Button>
          <Button size="compact" tone="secondary">
            보조 Compact
          </Button>
          <Button size="compact" tone="danger">
            위험 Compact
          </Button>
        </Row>
      </Section>
      <Section title="Static states">
        <Row>
          <Button disabled>비활성</Button>
          <Button loading loadingText="처리 중">
            저장
          </Button>
          <Button disabled loading loadingText="처리 중">
            저장 비활성
          </Button>
          <Button disabled size="compact">
            비활성 Compact
          </Button>
          <Button loading loadingText="처리 중" size="compact">
            저장 Compact
          </Button>
          <Button disabled loading loadingText="처리 중" size="compact">
            저장 비활성 Compact
          </Button>
        </Row>
      </Section>
    </Catalog>
  ),
};
