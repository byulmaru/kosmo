import { defineConfig } from 'mearie';

export default defineConfig({
  document: 'src/**/*.{ts,svelte}',
  schema: '../api/schema.graphql',
});
