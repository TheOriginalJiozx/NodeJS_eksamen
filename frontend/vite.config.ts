import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { config } from 'dotenv';

config();

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    hmr: false,
    proxy: {
      '/api': {
        target: process.env.PUBLIC_SERVER_URL,
        changeOrigin: true,
        secure: false
      }
      ,

      '/socket.io': {
        target: process.env.PUBLIC_SERVER_URL,
        ws: true,
        changeOrigin: true,
        secure: false
      }
    }
  }
});