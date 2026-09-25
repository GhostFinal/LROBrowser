# LastRO V2 IWA Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, LastRO-only installable IWA client in the `RoBrowserV2` repository that retains the current V2 behavior, connects exclusively through Direct TCP, stores server-bound accounts locally, and loads passive game resources from LastRO first with `clientdata.ltsd.ro` fallback.

**Architecture:** `RoBrowserV2` is a standalone Vite application and Signed Web Bundle pipeline with no dependency on the LastRO market website. It wraps a reviewed snapshot of the working V2 client with typed server/account/resource/network adapters, packages every executable JS/WASM/Lua/LUB asset, and leaves large passive game data remote and cached. No ordinary-browser WSS runtime is retained; unsupported environments stop before login.

**Tech Stack:** Node.js 24, pnpm 12.4.2, TypeScript, Vite 6, Vitest 3, IndexedDB, Chrome Isolated Web Apps, Direct Sockets `TCPSocket`, Web Streams, Wasmoon Lua 5.1/WASM, `wbn@0.0.9`, `wbn-sign@0.3.1`.

**Spec:** `docs/superpowers/specs/2026-09-25-lastro-iwa-client-design.md`

## Global Constraints

- The production client uses Direct TCP only. Do not add WebSocket, WSS, proxy, bridge, Electron, or ordinary-browser fallback code.
- The application supports only LastRO and exactly three built-in profile IDs: `lastro-3x`, `lastro-2x`, and disabled `lastro-app`.
- `lastro-app` must remain unavailable until a separate approved design supplies verified protocol parameters.
- Stored account passwords are plaintext local data and every account binds to one available server profile.
- All executable JS, MJS, Worker, WASM, Lua, and LUB content is inside the signed IWA. Remote sources may return passive game data only.
- Remote passive resource order is persistent cache, `https://game.lastro.cn/ro/client_re/`, then `https://clientdata.ltsd.ro/ro/client_re/`.
- Production runtime remote origins are allowlisted, not blocklisted: only `https://game.lastro.cn` and `https://clientdata.ltsd.ro` are permitted for passive resources. Any other absolute HTTP(S)/WS(S) origin in imported or built runtime code is a hard failure without adding that origin to public configuration or documentation.
- Preserve every current LastRO V2 module and regression test unless the spec explicitly removes it.
- Do not copy personal quick-login accounts, XKore profiles, private server profiles, credentials, signing keys, or production secrets into this repository.
- The repository is standalone: do not import, modify, publish, or depend on the LastRO market website, its V1 iframe/POPUP, Worker, MySQL schema, or upload protocol.
- Node remains `>=24 <25` and pnpm remains `12.4.2`.
- Use failing tests before production changes and keep one reviewable commit per task.
- Before publicly committing third-party client scripts or publishing a `.swbn`, record license/redistribution evidence in `docs/iwa/third-party-licenses.md`. If redistribution is not confirmed, keep imported third-party artifacts in ignored staging and stop public release.

## Source Baselines

- Working V2 source snapshot: `/run/media/parker/7A9F-F871/ROWeb/v2`
- Working core script data: `/run/media/parker/7A9F-F871/ROWeb/ro/client_re/System` and `/run/media/parker/7A9F-F871/ROWeb/ro/client_re/data/luafiles514/lua files`
- World-map source data: `/run/media/parker/7A9F-F871/ROWeb/ro/src/DB/worldData.js` and `/run/media/parker/7A9F-F871/ROWeb/ro/src/DB/Mobs/mob_db.js`
- Official 3转服 extraction source: `https://game.lastro.cn/ro/Online.js?70.84`
- Chrome IWA references: `https://developer.chrome.com/docs/iwa/introduction`, `https://developer.chrome.com/docs/iwa/direct-sockets`, and `https://developer.chrome.com/docs/iwa/developer-policy`

---

### Task 1: Scaffold the standalone IWA project and manifest

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `public/.well-known/manifest.webmanifest`
- Create: `public/icons/icon.svg`
- Create: `src/main.ts`
- Create: `src/app-shell.ts`
- Create: `src/styles.css`
- Create: `test/manifest.test.ts`
- Create: `.gitignore`

**Interfaces:**
- Produces standalone package `robrowser-v2`.
- Produces root scripts `dev`, `build`, `test`, `typecheck`, `lint`, `audit:iwa`, `bundle:iwa`, and `sign:iwa`.
- Produces `mountAppShell(root: HTMLElement): void`.
- The manifest is served at `/.well-known/manifest.webmanifest` and contains `version`, `start_url`, `display`, and both required permission policies.

- [ ] **Step 1: Write the manifest and shell tests.** In `test/manifest.test.ts`, read `public/.well-known/manifest.webmanifest` and assert `name === "LastRO V2"`, `version` matches `^\\d+(?:\\.\\d+)*$`, `start_url === "/"`, `display === "standalone"`, `permissions_policy["direct-sockets"]` and `permissions_policy["cross-origin-isolated"]` both equal `["self"]`, and no `socketProxy`, `WebSocket`, or WSS string exists in the manifest. Add a jsdom assertion that `mountAppShell` renders an environment status region, server region, account region, and game mount point.
- [ ] **Step 2: Run the focused test and verify failure.** Run `pnpm exec vitest run test/manifest.test.ts`; expect module/file-not-found failures.
- [ ] **Step 3: Add the standalone package.** Create the root Vite TypeScript app with scripts `dev`, `build`, `test`, `typecheck`, `audit:iwa`, `bundle:iwa`, and `sign:iwa`. Pin the selected Vite/Vitest/TypeScript versions in this repository; add no UI framework.
- [ ] **Step 4: Add the IWA manifest and app shell.** Place the manifest at the required well-known path, use a local SVG icon, import only local CSS/TypeScript, and render a minimal Chinese shell that can later host server/account controls and the V2 canvas.
- [ ] **Step 5: Wire standalone scripts and ignores.** Add root scripts for development, build, testing, type checking, import, audit, bundle, and signing. Ignore `dist`, `.staging`, `release`, `*.wbn`, `*.swbn`, `*.pem`, and signing passphrase files.
- [ ] **Step 6: Verify and commit.** Run `pnpm exec vitest run test/manifest.test.ts`, `pnpm build`, `pnpm typecheck`, and `git diff --check`; commit `feat(iwa): scaffold isolated LastRO client`.

### Task 2: Establish provenance, license, and credential gates

**Files:**
- Create: `scripts/import-v2-snapshot.mjs`
- Create: `config/v2-allowlist.json`
- Create: `config/forbidden-source-patterns.json`
- Create: `test/import-v2-snapshot.test.ts`
- Create: `docs/iwa/third-party-licenses.md`
- Create: `docs/iwa/source-provenance.md`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**
- `pnpm import:v2 -- --source <absolute-v2-path>` copies only allowlisted files to `.staging/v2` and writes `.staging/v2-manifest.json`.
- Manifest entries are `{ path: string; bytes: number; sha256: string }` sorted by path.
- The importer exits non-zero on missing allowlist entries, credentials/private profiles, or unexpected executable files. It records known legacy WebSocket/NodeSocket markers in the source manifest; Tasks 6 and 11 require those markers to be absent from production staging and `dist`.

- [ ] **Step 1: Write importer failure tests.** Build a temporary fixture with `Online.js`, one `lastro-*.mjs`, and a fake `lastro-v2-config.js` containing a quick-login password. Assert import rejects the private config. Add success coverage proving only explicit allowlist files are copied and the manifest order/hash is deterministic.
- [ ] **Step 2: Run the test and verify failure.** Run `pnpm exec vitest run test/import-v2-snapshot.test.ts`; expect missing importer/config failures.
- [ ] **Step 3: Define the reviewed allowlist.** Include `Online.js`, `LastROThreadEventHandler.js`, `ThreadEventHandler.js`, `PathFindingWorker.js`, `lastro-resource-path.js`, every production `lastro-*.mjs` imported by `Online.js`, and required tiny bootstrap assets. Exclude all `*.test.mjs`, `lastro-v2-config.js`, HTML entry files, XKore-only configuration, screenshots, and personal quick-login data.
- [ ] **Step 4: Implement hard-failure and migration-marker scanning.** Reject `quickLoginAccounts`, XKore profile definitions, known private profile IDs, embedded username/password object pairs, and PEM markers without printing matched secrets. Extract absolute HTTP(S)/WS(S) origins and reject every origin outside the approved official/backup pair without echoing the rejected origin into generated manifests or logs. Separately count `socketProxy`, `WebSocket`, `wss://`, `ws://`, `electronAPI`, and `NodeSocket` only inside the expected raw `Online.js`; reject those markers in every other imported file and carry only marker counts into the manifest for Task 6 to eliminate.
- [ ] **Step 5: Document provenance and redistribution status.** Record every imported category, its source path, upstream project/license evidence, LastRO-specific authorship, and the status of official Lua/LUB/game data. State that an unknown redistribution status blocks a public source commit or public `.swbn`, while local private test builds may use ignored staging.
- [ ] **Step 6: Verify against the real baseline without committing artifacts.** Run `pnpm import:v2 -- --source /run/media/parker/7A9F-F871/ROWeb/v2`; inspect only file names, counts, sizes, and hashes. Run the focused test and `git status --short`; confirm `.staging` is ignored and no credential-bearing source was added.
- [ ] **Step 7: Commit the importer and policy.** Run `git diff --check`; commit `build(iwa): add reviewed V2 import gate`.

### Task 3: Define immutable LastRO server profiles

**Files:**
- Create: `src/servers/server-profile.ts`
- Create: `src/servers/server-profiles.ts`
- Create: `test/server-profiles.test.ts`
- Create: `docs/iwa/server-profiles.md`

**Interfaces:**
- Exports `ServerAvailability`, `LastROServerProfile`, `LASTRO_SERVER_PROFILES`, `getServerProfile(id)`, and `getAvailableServerProfile(id)`.
- `getAvailableServerProfile("lastro-app")` throws `ServerUnavailableError` before any network call.

- [ ] **Step 1: Write exact profile tests.** Assert 3转服 is `45.248.8.68:28569`, `version=45`, `langtype=3`, `packetver=20211103`, keys `[1205481659,453061308,592073252]`, hash `83ba069fd7c9e7683c435cecd507b18d`, `clientVer=3`, and `lastroNid=3`. Assert 2转服 is `45.248.8.68:26569`, `version=45`, `langtype=4`, keys `[1205481659,453065404,592073252]`, the same packetver/hash, `clientVer=5`, and `lastroNid=5`. Assert App服 has no address/port/keys/hash and is unavailable.
- [ ] **Step 2: Run the focused test.** Run `pnpm exec vitest run test/server-profiles.test.ts`; expect missing module failures.
- [ ] **Step 3: Implement frozen profiles and lookup helpers.** Return readonly records; do not expose an editor or permit query parameters to override protocol values.
- [ ] **Step 4: Document evidence and the validation gap.** In `docs/iwa/server-profiles.md`, record the official `Online.js?70.84` extraction date, the `ClientVer=3` candidate values, the retained 2转服 `langtype=4` decision, and that 3转服 is not release-ready until a real login/character/map flow succeeds.
- [ ] **Step 5: Verify and commit.** Run the focused test, `pnpm typecheck`, and `git diff --check`; commit `feat(iwa): add LastRO server profiles`.

### Task 4: Implement plaintext server-bound account storage

**Files:**
- Create: `src/accounts/account-store.ts`
- Create: `src/accounts/account-ui.ts`
- Create: `test/account-store.test.ts`
- Create: `test/account-ui.test.ts`
- Modify: `src/app-shell.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Exports `LocalAccount`, `AccountDraft`, `AccountStore`, `IndexedDbAccountStore`, and `createAccountStore()`.
- `AccountStore` methods are `list(serverProfileId?)`, `get(id)`, `save(draft)`, `remove(id)`, and `markUsed(id, at)`.
- `mountAccountManager({ root, profiles, store, onLogin })` emits `{ profile, username, password, savedAccountId? }`.

- [ ] **Step 1: Write storage contract tests.** Use a small fake IndexedDB test adapter or inject an in-memory IDB factory. Assert plaintext username/password round-trip unchanged, records bind only to `lastro-3x` or `lastro-2x`, App服 saves fail, updates preserve `createdAt`, `markUsed` changes `lastUsedAt`, filtering is server-specific, and list order is most recently used then most recently updated.
- [ ] **Step 2: Write UI tests.** Assert all three server names render, App服 is disabled with the exact reason, switching server filters account cards, add/edit/delete calls the store, unsaved manual credentials can log in, and password input is masked visually even though stored plaintext.
- [ ] **Step 3: Run focused tests and verify failure.** Run `pnpm exec vitest run test/account-store.test.ts test/account-ui.test.ts`; expect missing module failures.
- [ ] **Step 4: Implement IndexedDB schema version 1.** Use database `lastro-iwa`, store `accounts`, key path `id`, and index `serverProfileId`. Generate IDs with `crypto.randomUUID()`. Do not add encryption, remote sync, or a master-password flow.
- [ ] **Step 5: Implement graceful storage failure.** If IndexedDB open/write fails, keep the current manual form usable, disable save controls, and show a local-storage error. Credentials may enter only the selected LastRO Direct TCP login flow and must never be sent to an HTTP API or telemetry service.
- [ ] **Step 6: Mount the account manager in the shell.** Server selection must happen before V2 bootstrap. The emitted profile supplies all protocol values; username/password are passed only to the client login call.
- [ ] **Step 7: Verify and commit.** Run both focused tests, `pnpm typecheck`, `pnpm build`, and `git diff --check`; commit `feat(iwa): store server-bound local accounts`.

### Task 5: Implement the Direct Sockets TCP adapter

**Files:**
- Create: `src/direct-sockets.d.ts`
- Create: `src/network/client-socket.ts`
- Create: `src/network/direct-tcp-socket.ts`
- Create: `src/network/socket-factory.ts`
- Create: `test/direct-tcp-socket.test.ts`
- Create: `test/socket-factory.test.ts`

**Interfaces:**
- Exports `LegacyClientSocket`, `DirectTcpSocket`, `isDirectSocketsSupported()`, and `createDirectSocket(host, port)`.
- `DirectTcpSocket` constructor is `new DirectTcpSocket(host: string, port: number, dependencies?: DirectSocketDependencies)`.
- Dependencies allow test injection of the `TCPSocket` constructor and microtask/error hooks.

- [ ] **Step 1: Write a fake TCPSocket harness.** Model `opened`, `closed`, a readable stream controller, and writable chunks. Assert `onComplete(true)` fires once after `opened`, split incoming chunks preserve bytes and exact `ArrayBuffer` boundaries, writes remain ordered when `send()` is called repeatedly, and `close()` releases reader/writer locks.
- [ ] **Step 2: Write error and handoff tests.** Assert constructor/open rejection calls `onComplete(false)` once, read failure calls `onClose` once, repeated close is a no-op, close during a queued write does not send later packets, and setting `handoffPending=true` survives until the existing NetworkManager close callback reads it. Task 6 covers the session-wide disconnect suppression at the integration boundary.
- [ ] **Step 3: Write factory tests.** When `globalThis.TCPSocket` is absent, `isDirectSocketsSupported()` is false and factory creation throws `UnsupportedDirectSocketsError`; assert the source has no reference to `WebSocket`, WSS, proxy URLs, or Electron.
- [ ] **Step 4: Run focused tests and verify failure.** Run `pnpm exec vitest run test/direct-tcp-socket.test.ts test/socket-factory.test.ts`; expect missing modules.
- [ ] **Step 5: Implement type declarations and adapter.** Use `new TCPSocket(host, port, { noDelay: true, keepAlive: true })`, a single reader loop, and a serialized write promise. Convert `Uint8Array` with `chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength)`.
- [ ] **Step 6: Implement deterministic teardown.** Abort/cancel the reader, close or abort the writer, close the socket, clear flags, and guard callbacks with `completed`/`closed` booleans.
- [ ] **Step 7: Verify and commit.** Run both focused tests, `pnpm typecheck`, and `git diff --check`; commit `feat(iwa): add Direct TCP socket adapter`.

### Task 6: Import the V2 runtime and replace its socket factory

**Files:**
- Create: `scripts/patch-v2-runtime.mjs`
- Create: `test/v2-runtime-patch.test.ts`
- Create: `src/runtime/client-config.ts`
- Create: `src/runtime/client-bootstrap.ts`
- Modify: `src/main.ts`
- Modify: `package.json`
- Generated in ignored staging: `.staging/runtime/*`

**Interfaces:**
- `buildClientConfig(profile)` returns a frozen V2 config with exactly one server, `lastroProtocol=true`, `lastroCustomPackets=true`, package-local executable roots, and no `socketProxy`/quick-login/XKore fields.
- `bootstrapV2Client({ mount, profile, credentials, socketFactory })` installs the factory before starting the imported runtime.
- Bootstrap assigns `globalThis.LastRODirectSocketFactory: (host: string, port: number) => LegacyClientSocket`; the patched V2 `defaultSocketFactory(host, port)` must call only this function and throw if it is absent.
- `patch-v2-runtime.mjs` transforms only anchored source regions and fails if any expected anchor count differs from one.

- [ ] **Step 1: Write config tests.** Assert each available profile maps exact address/port/version/langtype/packetver/keys/hash/clientVer values, App服 throws, `servers.length === 1`, `autoLogin` contains only the user-selected current credentials, and serialized config contains no WSS/XKore/private quick-login fields.
- [ ] **Step 2: Write patch tests with a small fixture.** Assert the patch replaces the V2 `defaultSocketFactory` body with an injected Direct TCP factory hook, removes initialization/use of WebSocket and NodeSocket helpers from production runtime, and fails closed when anchors drift.
- [ ] **Step 3: Run focused tests and verify failure.** Run `pnpm exec vitest run test/v2-runtime-patch.test.ts`; expect missing patch/bootstrap failures.
- [ ] **Step 4: Patch the real ignored snapshot.** Run import then patch against `.staging/v2/Online.js`. Replace `defaultSocketFactory` with the exact `globalThis.LastRODirectSocketFactory(host, port)` contract, remove the WebSocket/NodeSocket initialization paths, and preserve the existing handoff-aware NetworkManager close behavior. Do not edit the 12.7 MB artifact by unconstrained global replacements. Record pre/post SHA-256 and each transformed anchor in `.staging/runtime-manifest.json`.
- [ ] **Step 5: Add the bootstrap adapter.** Install `globalThis.ROConfig`, register `createDirectSocket`, mount the runtime in the IWA page, and call the existing V2 login path. Keep login/character/map server handoff logic inside the V2 protocol runtime.
- [ ] **Step 6: Add unsupported-environment UI.** Before loading V2, check `TCPSocket`; if missing, render a blocking Chinese message with supported Chrome/IWA instructions. Do not render a “use WSS instead” action.
- [ ] **Step 7: Verify no legacy transport remains.** Run `rg -n "new WebSocket|wss://|ws://|socketProxy|electronAPI|NodeSocket" .staging/runtime`; expect no matches. Run focused tests and build.
- [ ] **Step 8: Commit source adapters only.** Confirm staging remains ignored; commit `feat(iwa): bootstrap V2 over Direct TCP`.

### Task 7: Build the package-local executable asset set

**Files:**
- Create: `scripts/import-core-assets.mjs`
- Create: `scripts/build-core-manifest.mjs`
- Create: `config/core-asset-roots.json`
- Create: `test/core-assets.test.ts`
- Generated in ignored staging: `.staging/core/**`
- Generated in build output: `dist/core/executable-assets.json`
- Modify: `package.json`

**Interfaces:**
- `import:core` accepts explicit `--client-root` and `--ro-source-root` arguments.
- It stages all 473 current files under `data/luafiles514/lua files`, all four current `.lua` files under `System`, world-map source inputs, and Wasmoon/WASM artifacts referenced by the V2 build.
- Manifest entries are `{ path, bytes, sha256, kind: "lua" | "lub" | "wasm" | "data-json" | "runtime" }`.

- [ ] **Step 1: Write fixture tests.** Assert recursive Lua/LUB import preserves relative paths and case, ignores passive assets next to scripts, rejects symlinks escaping the source root, and makes duplicate destination paths fail. Assert manifest sorting and hashes are stable.
- [ ] **Step 2: Add baseline-count assertions.** For the known source snapshot, require 473 Lua/LUB files totaling 49,723,747 bytes under the `luafiles514` root and four Lua files totaling 29,899,365 bytes under `System`. Make any count/byte change a review failure, not an automatic deletion/addition.
- [ ] **Step 3: Run focused tests and verify failure.** Run `pnpm exec vitest run test/core-assets.test.ts`; expect missing importer failure.
- [ ] **Step 4: Implement safe staged copying.** Require absolute input roots, normalize paths, refuse `..`, refuse unsupported executable extensions, and never follow out-of-root symlinks. Do not copy maps, sprites, textures, models, audio, private configuration, or GRF archives.
- [ ] **Step 5: Locate and stage the Lua WASM runtime.** Parse the patched runtime/build metadata to identify the Wasmoon WASM file. If the current bundle embeds it, preserve the embedded runtime; if emitted separately, include it in the executable manifest. Never fetch it at runtime.
- [ ] **Step 6: Run against the real baseline.** Execute `pnpm import:core -- --client-root /run/media/parker/7A9F-F871/ROWeb/ro/client_re --ro-source-root /run/media/parker/7A9F-F871/ROWeb/ro/src`; inspect count/size/hash summaries without committing staged third-party files.
- [ ] **Step 7: Verify and commit.** Run the focused test, typecheck, and `git diff --check`; commit `build(iwa): stage executable client assets`.

### Task 8: Convert runtime-generated code paths to CSP-safe package data

**Files:**
- Create: `scripts/convert-world-data.mjs`
- Create: `scripts/audit-runtime-code.mjs`
- Create: `test/world-data-conversion.test.ts`
- Create: `test/csp-runtime-audit.test.ts`
- Modify staged module during build: `lastro-worldmap-details.mjs`
- Modify generated staged runtime: `Online.js`
- Generated: `.staging/core/data/world/world-data.json`
- Generated: `.staging/core/data/world/mob-data.json`

**Interfaces:**
- `convert-world-data.mjs --world <path> --mobs <path> --out <dir>` produces deterministic JSON.
- Patched `loadWorldMapNameData()` and `loadWorldMapData()` fetch only package-local JSON.
- `audit-runtime-code.mjs <dist>` parses production JavaScript with the TypeScript compiler API and exits non-zero on executable `eval`, `new Function`, `Function(...)`, remote `<script>`, or non-package executable fetch paths.

- [ ] **Step 1: Write world-data conversion tests.** Use representative AMD factories and assert converted JSON keeps map names, branch arrays, mob IDs, monster levels, names, and drop fields. Assert executable expressions or unexpected top-level code are rejected by the converter rather than evaluated in the application.
- [ ] **Step 2: Write CSP audit tests.** AST fixtures containing `Function("return this")()`, `new Function(...)`, `Function(importsKeys, source)`, `eval(code)`, remote script element creation, or network-loaded `.lua/.lub` must fail. Strings and comments that merely mention these APIs must not fail; source maps remain excluded from release.
- [ ] **Step 3: Run focused tests and verify failure.** Run `pnpm exec vitest run test/world-data-conversion.test.ts test/csp-runtime-audit.test.ts`.
- [ ] **Step 4: Convert AMD data at build time.** Use a Node-only isolated parser with a single captured `define(factory)` contract; reject access to Node globals, imports, side effects, or multiple definitions. Serialize stable JSON with sorted top-level keys.
- [ ] **Step 5: Patch world-map loading.** Replace `Function('define', source)` with package-local JSON reads and preserve all existing exported helper signatures.
- [ ] **Step 6: Remove Lodash dynamic constructors.** Patch the vendored runtime so global detection uses `globalThis` and the unused `_.template` compiler path is excluded or replaced by a function that throws a deterministic unsupported error. First run `rg` to confirm production V2 has no call to `_.template`; if a live call exists, stop this task and implement a precompiled template for that exact call before continuing.
- [ ] **Step 7: Audit the staged production runtime.** Run the audit and `rg -n "eval\\(|new Function|Function\\(" .staging/runtime .staging/core`; expect no executable matches.
- [ ] **Step 8: Verify and commit.** Run focused tests, build, and `git diff --check`; commit `fix(iwa): satisfy isolated app CSP`.

### Task 9: Implement official-first passive resource resolution

**Files:**
- Create: `src/resources/resource-policy.ts`
- Create: `src/resources/resource-cache.ts`
- Create: `src/resources/resource-resolver.ts`
- Create: `test/resource-policy.test.ts`
- Create: `test/resource-resolver.test.ts`
- Modify staged: `LastROThreadEventHandler.js`
- Modify staged: `lastro-resource-path.js` only if required to export existing helpers cleanly
- Create: `docs/iwa/resource-sources.md`

**Interfaces:**
- Exports `classifyResource(path): "packaged-executable" | "remote-passive" | "forbidden"`.
- Exports `resolvePassiveResource(path, options): Promise<ArrayBuffer>`.
- Cache interface is `match(path)`, `put(path, bytes, metadata)`, and `delete(path)`; metadata records source URL, ETag/Last-Modified when present, size, and saved time.
- Worker receives ordered resource roots and package-executable manifest through initialization messages.

- [ ] **Step 1: Write classification tests.** Assert JS/MJS/Worker/WASM/Lua/LUB are package-only; map/sprite/model/texture/audio extensions are remote-passive; unknown executable-looking extensions are forbidden. Assert case and slash normalization cannot bypass the rule.
- [ ] **Step 2: Write resolver tests.** Cover cache hit without fetch, official success, official 404 then backup-source success, official CORS/network/timeout/5xx/HTML response then backup-source success, both roots failing with a structured error, and successful backup-source bytes entering persistent cache.
- [ ] **Step 3: Preserve path-candidate behavior.** Port the existing GBK/EUC-KR mixed segment recovery, lowercase extension, item-icon lowercase, and historical Sprite suffix tests. Assert every encoded candidate is tried against official before the backup source and the candidate order is deterministic.
- [ ] **Step 4: Run focused tests and verify failure.** Run `pnpm exec vitest run test/resource-policy.test.ts test/resource-resolver.test.ts`.
- [ ] **Step 5: Implement the resolver and cache.** Use package-local executable lookups first, persistent cached passive data second, official HTTPS third, and `clientdata.ltsd.ro` HTTPS fourth. Apply a bounded per-attempt timeout. Treat non-2xx, HTML content, zero-length content where invalid, abort, DNS/fetch rejection, and decode failures as fallback conditions.
- [ ] **Step 6: Patch the resource Worker.** Replace single-root `se.remoteClient` behavior with ordered roots and the executable manifest. Make audio pass through the same ArrayBuffer resolver and object-URL conversion so it receives fallback/cache behavior.
- [ ] **Step 7: Document source policy and launch checks.** Record the 2026-09-25 sample where the official path returned 404. State that `clientdata.ltsd.ro` is intentionally not DNS-resolvable before product launch and make DNS, TLS, CORS/CORP, content type, Range/cache behavior, and known-resource checks mandatory before release. Document cache invalidation metadata and the rule that remote content is never executable.
- [ ] **Step 8: Verify and commit.** Run focused tests, the migrated `lastro-resource-path` tests, build, and `git diff --check`; commit `feat(iwa): add official-first resource fallback`.

### Task 10: Preserve and verify every LastRO V2 module

**Files:**
- Create: `config/lastro-module-inventory.json`
- Create: `test/module-inventory.test.ts`
- Create: `test/v2-regression-runner.test.ts`
- Modify: `scripts/import-v2-snapshot.mjs`
- Import/adapt tests from: `/run/media/parker/7A9F-F871/ROWeb/v2/lastro-*.test.mjs`

**Interfaces:**
- Inventory entries are `{ module, tests, capability, required: true }`.
- The import step fails if an inventoried production module or its declared tests are absent.
- Regression runner executes Node-compatible legacy tests and reports skipped browser-only tests as explicit failures until a Vitest equivalent exists.

- [ ] **Step 1: Create the inventory from current production imports.** Include navigation debug, packet framing, V1 migration, world-map details, map state, quick teleport, effect compatibility, card collection/data UI, item movement, observer mode, minimap guild rendering, and guild emblem request. Also list bundle-embedded behaviors covered only by tests: battle labels, body palette, buying store, cash shop, debug enter, enchant grade, equipment costume, fog, ground item, hat table, item reform, navigation packets, quest panel, receive framing, status charset, and XKore-derived packet framing cases that remain relevant to LastRO but not XKore profiles.
- [ ] **Step 2: Write inventory tests.** Assert every module exists in staged runtime, every declared test exists, no `required` entry is skipped, and the production `Online.js` import list still references the modules it used before migration.
- [ ] **Step 3: Port test execution without dynamic code in production.** Tests may use Node VM/function construction because they do not ship in IWA, but prefer direct module imports. Preserve expected packet bytes and protocol fixtures exactly.
- [ ] **Step 4: Remove XKore product behavior while retaining protocol regressions.** Delete profile/UI tests that require XKore endpoints; keep framing/packet parsing fixtures if they exercise ordinary LastRO traffic. Rename tests so public output does not advertise XKore as a supported server.
- [ ] **Step 5: Run all V2 regressions.** Run `pnpm exec vitest run test/module-inventory.test.ts test/v2-regression-runner.test.ts` plus any direct Node tests wrapped by the package script; fix migration regressions before continuing.
- [ ] **Step 6: Commit.** Run `git diff --check`; commit `test(iwa): preserve LastRO V2 modules`.

### Task 11: Build, audit, bundle, and sign reproducibly

**Files:**
- Create: `config/bundle-headers.json`
- Create: `scripts/audit-iwa-dist.mjs`
- Create: `scripts/bundle-iwa.mjs`
- Create: `scripts/sign-iwa.mjs`
- Create: `test/audit-iwa-dist.test.ts`
- Create: `test/bundle-iwa.test.ts`
- Create: `docs/iwa/development.md`
- Create: `docs/iwa/release.md`
- Modify: `package.json`

**Interfaces:**
- `audit:iwa` emits `release/audit-report.json` with bundle version, file count, bytes by category, prohibited-pattern results, core manifest summary, and external origins.
- `bundle:iwa` creates `release/lastro-v2-<version>.wbn` using base URL derived from the intended Web Bundle ID when supplied.
- `sign:iwa -- --key <absolute-pem-path>` creates `.swbn`, checksum, and `release-manifest.json` without copying the key.

- [ ] **Step 1: Write dist-audit tests.** A fixture bundle must fail for missing well-known manifest, WSS/WebSocket/Electron strings, dynamic JS compilation, remote executable references, private credential structures, PEM content, absolute local source paths, source maps, or an executable manifest entry missing from disk.
- [ ] **Step 2: Write bundle tests.** Build a tiny fixture directory, run `wbn@0.0.9`, parse it with the `wbn` library, and assert all files exist under one base URL with CSP/COOP/COEP/CORP header overrides. Generate a temporary Ed25519 key during the test, sign with `wbn-sign@0.3.1`, parse signer info, and delete the temporary key in `finally`.
- [ ] **Step 3: Run focused tests and verify failure.** Run `pnpm exec vitest run test/audit-iwa-dist.test.ts test/bundle-iwa.test.ts`.
- [ ] **Step 4: Implement strict build auditing.** Require `/.well-known/manifest.webmanifest`, package-local scripts, correct MIME types, `Content-Security-Policy: script-src 'self' 'wasm-unsafe-eval'`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, and `Cross-Origin-Resource-Policy: same-origin`. Permit HTTPS only for passive fetch/img/media uses, allow only `https://game.lastro.cn` and `https://clientdata.ltsd.ro`, reject all HTTP/WS/WSS origins, and redact any rejected origin from the persisted audit report.
- [ ] **Step 5: Pin bundling dependencies.** Add exact development versions `wbn@0.0.9` and `wbn-sign@0.3.1`; do not use unpinned `npx` in release scripts.
- [ ] **Step 6: Implement unsigned and signed release scripts.** Require an absolute key path outside the repo, refuse keys located below the repository root, read `WEB_BUNDLE_SIGNING_PASSPHRASE` without logging it, and output SHA-256/Web Bundle ID/version/size. Signing without a key must fail with usage text.
- [ ] **Step 7: Document development and release.** Include Dev Mode Proxy setup, local signed-bundle installation, production key backup, identity continuity, allowlist/distribution caveats, version updates, third-party license gate, and recovery if signing fails. Provide Linux shell commands first and PowerShell equivalents where behavior differs.
- [ ] **Step 8: Verify and commit.** Run focused tests, `pnpm build`, `pnpm audit:iwa`, unsigned bundle generation, and `git diff --check`; commit `build(iwa): add signed bundle pipeline`.

### Task 12: Run complete automated and manual release validation

**Files:**
- Create: `test/release-smoke.test.ts`
- Create: `docs/iwa/release-checklist.md`
- Create: `docs/iwa/manual-validation-2x.md`
- Create after successful validation: `docs/iwa/manual-validation-3x.md`
- Create: `README.md`
- Create: `AGENTS.md`

**Interfaces:**
- Release smoke consumes `release-manifest.json`, the `.swbn`, executable asset manifest, V2 module inventory, and audit report.
- 3转服 cannot move from candidate to released until `manual-validation-3x.md` records successful login, character selection, map entry, movement, and map transition.

- [ ] **Step 1: Write the release-smoke test.** Assert audit report passes, signed bundle exists, checksum matches, manifest versions agree, all inventoried modules/core assets are in the bundle, App服 remains unavailable, and no ignored signing/staging file is tracked by Git.
- [ ] **Step 2: Run the entire automated suite and sign a candidate.** Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm audit:iwa`, and `pnpm bundle:iwa`. On Linux set `LASTRO_IWA_SIGNING_KEY` to an absolute candidate-key path outside the repository; on PowerShell set `$env:LASTRO_IWA_SIGNING_KEY`. Run `pnpm sign:iwa -- --key "$LASTRO_IWA_SIGNING_KEY"` on Linux or the PowerShell equivalent, then run the release-smoke test. Run `git diff --check` and `git status --short`. If no authorized external key is available, stop before claiming release completion.
- [ ] **Step 3: Validate the backup resource domain before release.** From at least one China network and one non-China network, verify `clientdata.ltsd.ro` resolves to the intended deployment, presents the expected TLS certificate, permits IWA cross-origin reads with compatible CORS/CORP headers, returns non-HTML bytes and correct content types for known `.str`, `.spr`, and audio samples, and supports the chosen cache/Range behavior. Record exact URLs, status codes, headers, hashes, and test date in `docs/iwa/resource-sources.md`; do not release while this gate fails.
- [ ] **Step 4: Install a signed candidate in Chrome IWA dev mode.** Record Chrome version, OS, Web Bundle ID, bundle SHA-256, install method, and whether Direct Sockets DevTools shows the login/character/map TCP connections.
- [ ] **Step 5: Validate 2转服 end to end.** Add a local account, restart the IWA and confirm persistence, log in, select a character, enter a map, move, change map, load inventory/skills/quests/guild/card collection/auto-battle/quick teleport, then clear/passively refill resource cache. Record failures and rerun the relevant focused tests after fixes.
- [ ] **Step 6: Validate 3转服 before release.** Repeat login, character selection, map entry, movement, and map transition using a 3转服 account. If any candidate parameter fails, leave 3转服 visibly unavailable and revise the spec/profile only with captured evidence; do not guess replacement values.
- [ ] **Step 7: Validate App服 placeholder.** Confirm it cannot bind an account, does not call `TCPSocket`, and displays the exact unavailable reason.
- [ ] **Step 8: Complete legal/release gates.** Confirm `docs/iwa/third-party-licenses.md` authorizes every artifact present in the public source tree and distributable `.swbn`. If not, stop at a private candidate and do not publish the bundle.
- [ ] **Step 9: Update project handoff docs.** Add IWA build/test/release commands, known browser/distribution limitations, server verification status, backup-resource-domain launch status, and the exact location of generated reports.
- [ ] **Step 10: Final commit.** After all applicable automated and manual gates pass, commit `docs(iwa): record client release validation`.

## Implementation Order and Checkpoints

1. Tasks 1-3 establish the safe shell and immutable configuration.
2. Tasks 4-6 produce a locally usable Direct TCP login path.
3. Tasks 7-10 make the runtime self-contained, CSP-compliant, resource-efficient, and feature-complete.
4. Task 11 creates the audited signed artifact.
5. Task 12 is the release gate; do not call the work complete before its automated checks and required real-server validations pass.

## Self-Review Coverage

- Direct TCP only: Tasks 5, 6, 11, and 12.
- Three LastRO server entries and App placeholder: Tasks 3, 4, and 12.
- Plaintext local accounts bound to servers: Task 4.
- Official-first resource fallback through `clientdata.ltsd.ro`, including pre-launch DNS/TLS/CORS validation: Tasks 9 and 12.
- Package-local Lua/LUB and no remote code execution: Tasks 7, 8, and 11.
- Preserve all V2 custom modules: Tasks 2 and 10.
- Small package instead of full client resources: Tasks 7, 9, and 11.
- IWA signing, identity, update readiness, and installation: Tasks 1, 11, and 12.
- Standalone repository boundary with no LastROWeb runtime dependency: Tasks 1, 2, 11, and 12.
- Credential, signing-key, and redistribution safety: Tasks 2, 11, and 12.
