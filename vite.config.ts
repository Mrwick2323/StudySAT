/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const DEFAULT_API_BASE =
  'https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/digital';

/**
 * Adds a Content-Security-Policy to the production build only. Question content
 * is third-party HTML/SVG/MathML, so even though it is sanitized before being
 * rendered we also forbid scripts from anywhere but our own origin. The dev
 * server is left alone because Vite injects inline scripts for hot reloading.
 */
function contentSecurityPolicy(apiBase: string): Plugin {
  const apiOrigin = new URL(apiBase).origin;
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    // Question markup uses inline style attributes (alignment, underlines, table widths).
    "style-src 'self' 'unsafe-inline'",
    // Legacy questions embed their math as base64 PNGs.
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${apiOrigin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'studysat-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiBase = env.VITE_QBANK_API_BASE || DEFAULT_API_BASE;
  return {
    // Relative base so the static build works from any sub-path (e.g. GitHub Pages).
    base: './',
    plugins: [react(), contentSecurityPolicy(apiBase)],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      restoreMocks: true,
    },
  };
});
