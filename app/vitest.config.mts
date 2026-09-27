import { fileURLToPath } from 'node:url';
import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  // Bound cold DOM and crypto imports without relaxing individual test deadlines.
  test: { environment: 'node', include: ['tests/**/*.test.{ts,tsx}'], restoreMocks: true, maxWorkers: Math.min(4, Math.max(1, availableParallelism() - 1)) },
  oxc: { jsx: { runtime: 'automatic' } },
});
