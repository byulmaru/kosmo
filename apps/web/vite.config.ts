import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { sark } from '@typie/sark/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sark(), sveltekit()],
  server: {
    port: 8261,
    strictPort: true,
  },
});
