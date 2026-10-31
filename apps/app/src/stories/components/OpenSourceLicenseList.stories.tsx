import { View } from 'react-native';
import { expect, userEvent, within } from 'storybook/test';
import { OpenSourceLicenseList } from '@/components/settings/OpenSourceLicenseList';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { OpenSourceLicenseNotice } from '@/components/settings/OpenSourceLicenseList';

const notices: readonly OpenSourceLicenseNotice[] = [
  {
    license: 'MIT',
    name: 'sample-package-with-a-long-name-that-wraps-on-mobile',
    sourceUrl: 'https://licenses.example.test/packages/long-name',
    text: `Sample notice text for preview only. It demonstrates long, selectable original text without representing a real package notice.

Second sample paragraph with enough content to show the expanded notice layout on narrow screens.`,
    version: '1.0.0',
  },
  {
    license: 'Apache-2.0',
    name: 'sample-second-package',
    sourceUrl: 'https://licenses.example.test/packages/second',
    text: 'Second sample original notice text for interaction preview.',
    version: '2.0.0',
  },
  {
    license: 'CC-BY-4.0',
    name: 'sample-pending-package',
    sourceUrl: 'https://licenses.example.test/packages/pending',
    text: '',
    version: '',
  },
];

const meta = {
  args: { notices },
  component: OpenSourceLicenseList,
  decorators: [
    (Story) => (
      <View style={{ maxWidth: 600, width: '100%' }}>
        <Story />
      </View>
    ),
  ],
  excludeStories: ['InteractionContract'],
  title: 'KOSMO/Components/Open Source License List',
} satisfies Meta<typeof OpenSourceLicenseList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RepresentativeStates: Story = {};

export const InteractionContract: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const fullNoticeName = 'sample-package-with-a-long-name-that-wraps-on-mobile, 버전 1.0.0, MIT';
    const secondNoticeName = 'sample-second-package, 버전 2.0.0, Apache-2.0';
    const pendingNoticeName = 'sample-pending-package, CC-BY-4.0';
    const fullNotice = canvas.getByRole('button', { name: fullNoticeName });
    const secondNotice = canvas.getByRole('button', { name: secondNoticeName });
    const packageName = canvas.getByText('sample-package-with-a-long-name-that-wraps-on-mobile', {
      exact: true,
    });

    await expect(fullNotice).toHaveAttribute('aria-expanded', 'false');
    await expect(secondNotice).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.queryByRole('button', { name: pendingNoticeName })).toBeNull();
    await expect(packageName.getBoundingClientRect().height).toBeGreaterThan(24);
    await userEvent.click(fullNotice);
    await expect(fullNotice).toHaveAttribute('aria-expanded', 'true');

    const licenseText = canvas.getByText((_, element) => element?.textContent === notices[0]!.text);
    await expect(licenseText).toBeVisible();
    await expect(getComputedStyle(licenseText).userSelect).toBe('text');
    const sourceLink = canvas.getByRole('link', {
      name: 'sample-package-with-a-long-name-that-wraps-on-mobile 출처 보기',
    });
    await expect(sourceLink).toHaveAttribute('href', notices[0]!.sourceUrl);

    await userEvent.click(secondNotice);
    await expect(fullNotice).toHaveAttribute('aria-expanded', 'false');
    await expect(secondNotice).toHaveAttribute('aria-expanded', 'true');
    await expect(licenseText).not.toBeVisible();
    const secondLicenseText = canvas.getByText(notices[1]!.text, { exact: true });
    await expect(secondLicenseText).toBeVisible();
    await expect(getComputedStyle(secondLicenseText).userSelect).toBe('text');
    await expect(
      canvas.getByRole('link', { name: 'sample-second-package 출처 보기' }),
    ).toHaveAttribute('href', notices[1]!.sourceUrl);
    await expect(
      canvas.queryByRole('link', { name: 'sample-pending-package 출처 보기' }),
    ).toBeNull();

    await userEvent.click(secondNotice);
    await expect(secondNotice).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.queryByRole('link', { name: /출처 보기/ })).toBeNull();
  },
};
