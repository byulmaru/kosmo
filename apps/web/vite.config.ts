import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { cjsInterop } from 'vite-plugin-cjs-interop';
import devtoolsJson from 'vite-plugin-devtools-json';
import relay from 'vite-plugin-relay-lite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    relay(),
    cjsInterop({ dependencies: ['relay-runtime'] }),
    devtoolsJson(),
  ],
  server: {
    port: 8261,
    strictPort: true,
    allowedHosts: ['localhost', 'local.kos.moe'],
  },
});
