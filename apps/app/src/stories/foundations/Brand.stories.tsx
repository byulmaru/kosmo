import { BrandLogo } from '@/components/BrandLogo';
import { Catalog, Row, Section } from '../StoryFrame';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  parameters: { controls: { disable: true }, layout: 'fullscreen' },
  title: 'KOSMO/Foundations/Brand',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Logo: Story = {
  render: () => (
    <Catalog>
      <Section title="Logo">
        <Row>
          <BrandLogo width={96} />
          <BrandLogo variant="full" width={220} />
        </Row>
      </Section>
    </Catalog>
  ),
};
