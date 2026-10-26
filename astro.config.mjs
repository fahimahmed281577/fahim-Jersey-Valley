import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// https://astro.build/config
export default defineConfig({
  // Server-rendered by default to support Firebase auth cookies, dynamic cart & checkout
  output: 'server',
  server: {
    port: 3000,
    host: true,
  },
  integrations: [
    react({
      include: ['**/components/**/*.{jsx,tsx}', '**/pages/**/*.{jsx,tsx}']
    })
  ],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve('./src'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  },
});
