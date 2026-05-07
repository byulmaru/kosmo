import { defineConfig } from 'mearie';

export default defineConfig({
  document: 'src/**/*.{ts,tsx}',
  schema: '../api/schema.graphql',
});
