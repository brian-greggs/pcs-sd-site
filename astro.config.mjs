// @ts-check
import { defineConfig } from 'astro/config';

// Static output only: every page is a prebuilt file, nothing runs on a server.
export default defineConfig({
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
});
