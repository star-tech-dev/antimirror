import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['node_modules/**', '.wxt/**', '.output/**', '.output-spike/**', '.browser-cache/**', 'test-results/**', 'playwright-report/**', 'testing/fixture-lab/**'] },
  js.configs.recommended, ...tseslint.configs.recommended,
  { languageOptions: { globals: { console: 'readonly', process: 'readonly', URL: 'readonly', DOMMatrix: 'readonly', WebSocket: 'readonly', clearTimeout: 'readonly', setTimeout: 'readonly', chrome: 'readonly', getComputedStyle: 'readonly', window: 'readonly', document: 'readonly', TreeWalker: 'readonly', location: 'readonly' } } },
);
