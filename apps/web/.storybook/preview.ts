import '../src/routes/layout.css';

import type { Preview } from '@storybook/sveltekit';

const preview: Preview = {
  parameters: {
    backgrounds: {
      options: {
        kosmoLight: { name: 'KOSMO Light', value: '#ffffff' },
        kosmoSurface: { name: 'KOSMO Surface', value: '#f6f6f6' },
        kosmoDark: { name: 'KOSMO Dark', value: '#111111' },
      },
      grid: {
        cellSize: 4,
        cellAmount: 4,
        opacity: 0.18,
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: 'padded',
  },
  initialGlobals: {
    backgrounds: { value: 'kosmoLight' },
  },
};

export default preview;
