import adapter from '@sveltejs/adapter-node';

const isStorybook = process.env.STORYBOOK === 'true';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  compilerOptions: {
    // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
    runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true),
  },
  kit: {
    alias: {
      $mearie: isStorybook ? './.storybook/mocks/mearie.ts' : './.mearie/graphql.js',
    },
    adapter: adapter(),
  },
};

export default config;
