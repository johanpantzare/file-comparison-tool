import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/file-comparison-tool/',
  plugins: [react()],
  test: {
    environment: 'node',
  },
});
