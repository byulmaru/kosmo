import { View } from 'react-native';
import { expect, userEvent, within } from 'storybook/test';
import { OpenSourceLicenseList } from '@/components/settings/OpenSourceLicenseList';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { OpenSourceLicenseNotice } from '@/components/settings/OpenSourceLicenseList';

const notices: readonly OpenSourceLicenseNotice[] = [
  {
    license: 'MIT',
    name: '@kosmo/a-package-with-a-long-name-that-wraps-on-mobile',
    sourceUrl: 'https://licenses.example.test/packages/long-name',
    text: `MIT License

Copyright (c) 2026 KOSMO contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.`,
    version: '1.0.0',
  },
  {
    license: 'CC-BY-4.0',
    name: 'font-attribution-notice',
    sourceUrl: 'https://licenses.example.test/assets/font-attribution',
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
    const fullNoticeName =
      '@kosmo/a-package-with-a-long-name-that-wraps-on-mobile, 버전 1.0.0, MIT';
    const pendingNoticeName = 'font-attribution-notice, CC-BY-4.0';
    const fullNotice = canvas.getByRole('button', { name: fullNoticeName });
    const pendingNotice = canvas.getByRole('button', { name: pendingNoticeName });
    const packageName = canvas.getByText('@kosmo/a-package-with-a-long-name-that-wraps-on-mobile', {
      exact: true,
    });

    await expect(fullNotice).toHaveAttribute('aria-expanded', 'false');
    await expect(pendingNotice).toHaveAttribute('aria-expanded', 'false');
    await expect(packageName.getBoundingClientRect().height).toBeGreaterThan(24);
    await userEvent.click(fullNotice);
    await expect(fullNotice).toHaveAttribute('aria-expanded', 'true');

    const licenseText = canvas.getByText((_, element) => element?.textContent === notices[0]!.text);
    await expect(licenseText).toBeVisible();
    await expect(getComputedStyle(licenseText).userSelect).toBe('text');
    const sourceLink = canvas.getByRole('link', {
      name: '@kosmo/a-package-with-a-long-name-that-wraps-on-mobile 출처 보기',
    });
    await expect(sourceLink).toHaveAttribute('href', notices[0]!.sourceUrl);

    await userEvent.click(pendingNotice);
    await expect(fullNotice).toHaveAttribute('aria-expanded', 'false');
    await expect(pendingNotice).toHaveAttribute('aria-expanded', 'true');
    await expect(licenseText).not.toBeVisible();
    await expect(canvas.getByText('라이선스 고지 미확인')).toBeVisible();
    await expect(
      canvas.getByRole('link', { name: 'font-attribution-notice 출처 보기' }),
    ).toHaveAttribute('href', notices[1]!.sourceUrl);

    await userEvent.click(pendingNotice);
    await expect(pendingNotice).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.queryByRole('link', { name: /출처 보기/ })).toBeNull();
  },
};
