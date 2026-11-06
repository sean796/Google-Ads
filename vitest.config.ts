import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'src/**/*.test.ts',
            'wordpress-plugins/neo-pulse-app/tests/**/*.test.mjs',
            'wordpress-plugins/neo-pulse-wp/tests/**/*.test.mjs',
            'scripts/research/browser-automation/__tests__/**/*.test.mjs',
            'scripts/template-client-migrate/__tests__/**/*.test.ts',
            'scripts/edmonton-internal-links/__tests__/**/*.test.ts',
            'scripts/firstrank-teardown/__tests__/**/*.test.ts',
            'hosting/**/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./src/test/setup.ts'],
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
