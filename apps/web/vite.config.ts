import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { sark } from '@typie/sark/vite';
import devtoolsJson from 'vite-plugin-devtools-json';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sark(), sveltekit(), devtoolsJson()],
  server: {
    port: 8261,
    strictPort: true,
    allowedHosts: ['localhost', '.ngrok-free.app'],
  },
});
