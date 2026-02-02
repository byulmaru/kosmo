import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { cjsInterop } from 'vite-plugin-cjs-interop';
import devtoolsJson from 'vite-plugin-devtools-json';
import relay from 'vite-plugin-relay-lite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tanstackStart(),
    viteReact({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
    relay(),
    cjsInterop({ dependencies: ['react-relay', 'relay-runtime'] }),
    tailwindcss(),
    devtoolsJson(),
  ],
  server: {
    port: 8261,
    strictPort: true,
    allowedHosts: ['localhost', 'local.kos.moe'],
  },
});
