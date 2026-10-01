// Shared by the local IWA proxy, the signed bundle and its release audit.
export const REQUIRED_HEADERS = Object.freeze({
  'Content-Security-Policy': [
    "default-src 'self'", "base-uri 'none'", "object-src 'none'",
    "frame-src 'self'", "frame-ancestors 'none'", "form-action 'none'",
    "script-src 'self' 'wasm-unsafe-eval'", "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    // Keep executable content confined to the package without making CSP a
    // second resource loader. Game images, music, fonts and data retain their
    // original transport and fallback behavior.
    "img-src * data: blob:",
    "media-src * data: blob:",
    "font-src * data: blob:",
    "connect-src * data: blob:",
    "worker-src 'self'", "require-trusted-types-for 'script'",
    'trusted-types lastro-iwa-html lastro-iwa-worker',
  ].join('; '),
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
});
