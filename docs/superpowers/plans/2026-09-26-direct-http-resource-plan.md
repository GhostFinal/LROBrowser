# Direct HTTP Resource Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Load approved passive LastRO resources through IWA `TCPSocket` HTTP/1.1 requests so the client no longer depends on source-server CORS headers.

**Architecture:** Keep canonical approved resource URLs and the existing passive-resource resolver contract. Add a browser/IWA-compatible transport that validates the approved HTTPS origins, connects to their port 80 endpoints through `TCPSocket`, sends a bounded HTTP/1.1 GET, parses binary responses, and returns a Fetch-compatible `Response`. Package the transport through the existing esbuild resource-worker bundle; do not reuse the game packet socket adapter or add a Node/WebSocket/proxy dependency.

**Tech Stack:** TypeScript, Web Streams, IWA Direct Sockets `TCPSocket`, Vite/esbuild worker bundling, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-25-lastro-iwa-client-design.md`, with the current user directive overriding its passive-resource CORS/HTTPS-fetch assumption: source-side changes are unavailable, resource transport uses Direct TCP over port 80, and TLS is deferred.

## Global Constraints

- Only `TCPSocket` is used for the remote passive-resource transport.
- The transport accepts only the already approved `https://game.lastro.cn` and `https://clientdata.ltsd.ro` resource origins and `/ro/client_re/` paths.
- Remote content remains passive; `.js`, `.mjs`, `.cjs`, `.wasm`, `.lua`, and `.lub` stay package-only.
- No WebSocket, WSS, proxy, bridge, Electron, Node `net`/`http`, or TLS dependency is added.
- Canonical resource URLs remain HTTPS so origin auditing and a future TLS transport can reuse the same resolver contract; the current transport explicitly connects to port 80.
- Existing package lookup and cache behavior is preserved as infrastructure, but a cache miss must reach the approved source through Direct TCP.

### Task 1: Add the Direct HTTP/1.1 transport

**Files:**
- Create: `src/resources/direct-http-resource.ts`
- Create: `test/direct-http-resource.test.ts`

**Interfaces:**
- Produces `createDirectHttpFetch(options?): typeof globalThis.fetch`.
- `options` accepts an injectable `TCPSocket` constructor and bounded open/read/header/body timeouts for tests and runtime.
- The returned fetch accepts GET requests for approved canonical resource URLs and returns a Fetch-compatible `Response` with parsed status, headers, and binary body.

- [ ] Write failing tests for split response headers/body, `Content-Length`, chunked transfer, non-2xx status preservation, malformed/conflicting framing, and abort/timeout closing the native socket.
- [ ] Run `pnpm exec vitest run test/direct-http-resource.test.ts` and verify the new tests fail because the transport does not exist.
- [ ] Implement the minimal socket lifecycle, request serialization, response framing parser, size limits, and signal handling.
- [ ] Run the focused test until all transport tests pass.

### Task 2: Route passive resource misses through Direct TCP

**Files:**
- Modify: `src/resources/runtime-resource-loader.ts`
- Modify: `src/resources/resource-resolver.ts` only if the transport integration needs a typed fetch seam
- Modify: `test/resource-worker.test.ts`
- Modify: `test/v2-resource-startup.test.ts`

**Interfaces:**
- `createRuntimeResourceLoader()` injects `createDirectHttpFetch()` into `resolvePassiveResource()` for remote passive candidates.
- Package-local executable lookup continues using the worker's same-origin `fetch`.

- [ ] Add failing integration assertions that remote resource requests create `TCPSocket` connections and that package resources still use same-origin fetch.
- [ ] Run the focused worker/startup tests and verify they fail because the current loader calls remote `fetch`.
- [ ] Wire the Direct HTTP fetch into the runtime loader without changing path candidate order, executable classification, or cache semantics.
- [ ] Run the focused resolver/worker/startup tests and verify they pass.

### Task 3: Verify the generated IWA runtime and release audit boundary

**Files:**
- Modify: `test/resource-worker.test.ts` or add a focused generated-loader assertion where appropriate
- Modify: `test/audit-iwa-dist.test.ts` if the audit needs a Direct TCP transport invariant
- Modify: `docs/iwa/resource-sources.md` and `docs/iwa/remote-resource-validation.md`

- [ ] Add a failing assertion that the generated resource loader contains the Direct TCP transport and does not issue remote `fetch` calls for passive resources.
- [ ] Run the focused packaging/audit tests and verify the assertion fails before the integration is bundled.
- [ ] Update the generated-resource test contract and documentation to describe HTTP/1.1 over Direct TCP port 80, canonical source allowlisting, and the deferred TLS upgrade.
- [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm audit:iwa`, and `git diff --check`.

## Review Focus

- Response framing must not decode binary bodies as text or accept conflicting `Content-Length` values.
- Abort, timeout, read failure, and close must release streams and terminate the native socket exactly once.
- The transport must not become a general arbitrary-host TCP/HTTP primitive.
- The generated worker must keep package-only executable resources on the IWA origin and use Direct TCP only for approved passive origins.
