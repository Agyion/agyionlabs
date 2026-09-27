import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {alias: [
    {find: /^react$/, replacement: local('../app/node_modules/react/index.js')},
    {find: /^react\/jsx-runtime$/, replacement: local('../app/node_modules/react/jsx-runtime.js')},
    {find: /^react\/jsx-dev-runtime$/, replacement: local('../app/node_modules/react/jsx-dev-runtime.js')},
    {find: /^react-dom$/, replacement: local('../app/node_modules/react-dom/index.js')},
    {find: /^@testing-library\/react$/, replacement: local('../app/node_modules/@testing-library/react/dist/index.js')},
    {find: /^leaflet$/, replacement: local('./ui-tests/leaflet.stub.ts')},
    {find: /^leaflet\/dist\/leaflet.css$/, replacement: local('./ui-tests/leaflet.stub.css')},
  ]},
  test: {environment: 'jsdom', include: ['market/ui-tests/**/*.test.tsx'], restoreMocks: true},
});
