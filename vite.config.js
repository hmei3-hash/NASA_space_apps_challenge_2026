import { defineConfig } from 'vite';

// GitHub Pages serves a project site under /<repo>/. The deploy workflow sets PAGES_BASE;
// local `npm run dev` and `npm run build` keep the root path.
export default defineConfig({
  base: process.env.PAGES_BASE || '/',
});
