import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    csp: {
      mode: 'auto',
      directives: {
        'default-src': ['none'],
        'base-uri': ['none'],
        'connect-src': ['self'],
        'frame-ancestors': ['none'],
        'object-src': ['none'],
        'script-src': ['self'],
        'style-src': ['self'],
      },
    },
  },
};
