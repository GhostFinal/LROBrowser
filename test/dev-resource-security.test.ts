import { describe, expect, it } from 'vitest';
import { isLocalRequest, requestPath, resolveStagedResource } from '../scripts/dev-resource-security.mjs';
import { REQUIRED_HEADERS } from '../scripts/iwa-security.mjs';

describe('local IWA serving boundaries', () => {
  it('blocks DNS rebinding hosts and foreign origins while allowing the installed IWA', () => {
    expect(isLocalRequest('127.0.0.1:5173', undefined)).toBe(true);
    expect(isLocalRequest('127.0.0.1:5173', 'http://127.0.0.1:5173')).toBe(true);
    expect(isLocalRequest('127.0.0.1:5173', 'isolated-app://' + 'a'.repeat(56))).toBe(true);
    for (const host of ['evil.invalid:5173', '127.0.0.1.evil.invalid', '127.0.0.1:5173@evil.invalid']) expect(isLocalRequest(host, undefined)).toBe(false);
    for (const origin of ['https://evil.invalid', 'null', 'http://localhost:9999', 'isolated-app://evil.invalid']) expect(isLocalRequest('127.0.0.1:5173', origin)).toBe(false);
  });
  it.each(['/core/%2e%2e%2fpackage.json', '/runtime/%2e%2e%2f%2e%2e%2f.env', '/core/%252e%252e/a', '/core/a/../../.git/config', '/core/C:/secret', '/runtime/..\\secret'])('rejects encoded and platform traversal %s', url => {
    expect(() => resolveStagedResource(process.cwd(), url)).toThrow('invalid-');
  });
  it('rejects invalid escaping and strips only the URL query', () => {
    expect(() => requestPath('/core/%zz')).toThrow('invalid-request-path');
    expect(requestPath('/core/System/itemInfo.lua?v=1')).toBe('/core/System/itemInfo.lua');
  });
  it('uses the staged copy of account code and requires restrictive execution headers', () => {
    const result = resolveStagedResource(process.cwd(), '/runtime/lastro-account-login.mjs');
    expect(result?.file.replaceAll('\\', '/')).toContain('/generated/core/runtime/lastro-account-login.mjs');
    const csp = REQUIRED_HEADERS['Content-Security-Policy'];
    expect(csp).toContain("require-trusted-types-for 'script'");
    expect(csp).toContain("script-src-attr 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("img-src * data: blob:");
    expect(csp).toContain("media-src * data: blob:");
    expect(csp).toContain("font-src * data: blob:");
    expect(csp).toContain("connect-src * data: blob:");
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(REQUIRED_HEADERS['X-Content-Type-Options']).toBe('nosniff');
  });
});
