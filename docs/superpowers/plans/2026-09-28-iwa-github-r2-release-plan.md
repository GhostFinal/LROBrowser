# IWA GitHub Actions + Cloudflare R2 Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production release pipeline that validates, signs, versions, publishes, and retains the LastRO IWA through GitHub Actions and Cloudflare R2.

**Architecture:** Keep local `pnpm bundle:iwa` and disposable-key signing as development tools. Add deterministic release metadata/update-manifest scripts, an S3-compatible Cloudflare R2 publisher with immutable version paths and three-version retention, and separate CI/release workflows where only a protected environment can access production signing and R2 credentials.

**Tech Stack:** Node.js 24, pnpm 12.4.2, TypeScript/Vite/Vitest, `wbn`, `wbn-sign`, AWS SDK v3 S3 client, GitHub Actions, Cloudflare R2.

**Spec:** `docs/superpowers/specs/2026-09-28-iwa-github-r2-release-design.md`

## Global Constraints

- `manifest.version` uses `0.1.<github.run_number>`; commit SHA remains release metadata and artifact identity.
- Production releases use one stable Ed25519 key; changing it creates a new IWA identity.
- PR and ordinary CI jobs never read production signing or R2 write secrets.
- R2 paths are immutable under `releases/<version>/`; same bytes may be retried, different bytes must fail.
- `updates.json` is updated only after all new release objects pass verification.
- Only the newest three numeric versions remain in R2.
- No source maps, remote executable code, unapproved origins, WebSocket/WSS/proxy/Electron fallback, or credentials in the bundle.
- Client-side minification/obfuscation raises reverse-engineering cost but does not provide secrecy.
- Do not modify `/run/media/parker/7A9F-F871/ROWeb` or commit generated output/secrets.

## Review Focus

- Chrome rejects non-numeric IWA versions — test version generation and manifest validation.
- A reused version with changed bytes must never overwrite a published bundle — test R2 idempotency.
- A failed upload must not point `updates.json` at incomplete artifacts — test publish ordering.
- Fork/PR workflows must not expose production secrets — test workflow conditions and permissions.
- A wrong signing key must not create a release under the production identity — test Web Bundle ID verification.

---

### Task 1: Add release metadata and version generation

**Files:**
- Create: `scripts/build-release-metadata.mjs`
- Create: `scripts/build-update-manifest.mjs`
- Create: `test/release-metadata.test.ts`
- Create: `test/update-manifest.test.ts`
- Modify: `scripts/bundle-iwa.mjs`
- Modify: `public/.well-known/manifest.webmanifest`
- Modify: `package.json`

**Interfaces:**
- `getReleaseMetadata(input) -> { version, commitSha, channel, updateManifestUrl, bundleBaseUrl }`.
- `buildUpdateManifest(entries, options) -> object`.
- `validateIwaVersion(version) -> void` and `compareIwaVersions(left, right) -> number`.
- Release scripts read explicit CLI arguments or environment variables and fail if production values are missing/invalid.

- [ ] **Step 1: Write failing tests** for numeric versions, full SHA validation, URL validation, channel schema, monotonic ordering, duplicate versions, and same-version conflicting entries.
- [ ] **Step 2: Run focused tests** with `pnpm exec vitest run test/release-metadata.test.ts test/update-manifest.test.ts`; confirm failures.
- [ ] **Step 3: Implement metadata and update-manifest helpers** with deterministic JSON output and no guessed URLs.
- [ ] **Step 4: Add package scripts** for metadata/update-manifest generation and a production manifest build mode that injects `version` and `update_manifest_url` without changing the Phase A default.
- [ ] **Step 5: Run focused tests and `git diff --check`**; commit `build(iwa): add release metadata and update manifest generation`.

### Task 2: Add production signing and release artifact verification

**Files:**
- Create: `scripts/verify-release-inputs.mjs`
- Create: `scripts/sign-production-iwa.mjs`
- Create: `test/verify-release-inputs.test.ts`
- Modify: `scripts/sign-iwa.mjs`
- Modify: `test/bundle-iwa.test.ts`
- Modify: `test/release-smoke.test.ts`

**Interfaces:**
- `verifyReleaseInputs(input) -> normalized configuration` validates key, passphrase presence rules, expected Web Bundle ID, URLs, and version.
- Production signing writes only to a supplied output directory and returns `{ webBundleId, sha256, version, commitSha }`.
- Temporary PEM files are created by the workflow in runner temp storage, not in the repository.

- [ ] **Step 1: Write failing tests** for missing configuration, malformed URLs, wrong bundle ID, key-path restrictions, and matching signed metadata.
- [ ] **Step 2: Run focused tests** and confirm failures.
- [ ] **Step 3: Implement input verification and production signing wrapper** using the existing `wbn-sign` dependency and redacted error messages.
- [ ] **Step 4: Extend release smoke checks** to compare manifest, audit report, signed bundle, checksum, commit SHA, version, and Web Bundle ID.
- [ ] **Step 5: Run focused release tests and `git diff --check`**; commit `build(iwa): verify production signing inputs`.

### Task 3: Add Cloudflare R2 publisher with immutable paths and retention

**Files:**
- Create: `scripts/publish-r2.mjs`
- Create: `test/publish-r2.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- `createR2Client(config) -> S3Client`.
- `buildReleaseObjectKeys(metadata) -> object`.
- `publishRelease({ client, bucket, releaseDir, metadata, retentionCount }) -> result`.
- `publishRelease` uploads artifacts, verifies existing object hashes before accepting retries, writes `updates.json` last, and deletes only versions older than the newest three.

- [ ] **Step 1: Add the exact AWS SDK v3 S3 dependency** with pnpm and lockfile update.
- [ ] **Step 2: Write failing tests** using an in-memory fake S3 client for key layout, content-type, immutable retry, conflicting retry rejection, update ordering, and three-version retention.
- [ ] **Step 3: Run focused tests** and confirm failures.
- [ ] **Step 4: Implement R2 publisher** with explicit endpoint/credentials, no logging of secret values, and deterministic update manifest serialization.
- [ ] **Step 5: Run tests and `git diff --check`**; commit `build(iwa): publish immutable releases to R2`.

### Task 4: Add release and CI workflows

**Files:**
- Create: `.github/workflows/iwa-ci.yml`
- Create: `.github/workflows/iwa-release.yml`
- Create: `test/workflow-policy.test.ts`

**Interfaces:**
- CI workflow runs on pull requests and non-release pushes without protected secrets.
- Release workflow runs on `main` push and manual dispatch, uses `environment: iwa-production`, has concurrency protection, and requires minimum permissions.
- Release workflow creates temporary `IWA_SIGNING_KEY` PEM with mode `0600`, sets `WEB_BUNDLE_SIGNING_PASSPHRASE` only in the signing step, removes temporary files in an `always()` cleanup step, and uploads only final artifacts.

- [ ] **Step 1: Write failing workflow policy tests** that parse YAML and assert event conditions, environment binding, secret isolation, permissions, concurrency, pinned setup actions, and cleanup.
- [ ] **Step 2: Run focused workflow tests** and confirm failures.
- [ ] **Step 3: Implement `iwa-ci.yml`** with frozen install, lint, typecheck, tests, build, audit, bundle, and artifact upload.
- [ ] **Step 4: Implement `iwa-release.yml`** with metadata injection, production signing, R2 publish, post-publish HTTPS verification, and GitHub Release creation.
- [ ] **Step 5: Run workflow policy tests, YAML parse validation, and `git diff --check`**; commit `ci(iwa): add protected release workflow`.

### Task 5: Add release documentation and operator checks

**Files:**
- Create: `docs/iwa/ci-release.md`
- Create: `docs/iwa/distribution.md`
- Modify: `README.md`
- Modify: `docs/iwa/release.md`
- Modify: `docs/iwa/development.md`

**Interfaces:**
- Documentation lists every secret/environment variable, value type, format, creation procedure, scope, rotation behavior, and validation command.
- Documentation explains how to create the R2 bucket and public read URL, configure the GitHub `iwa-production` Environment, run manual release, inspect artifacts, and recover from failed publication.
- Documentation explicitly states that minification/signing protect integrity and provenance; browser-delivered code remains inspectable.

- [ ] **Step 1: Document Cloudflare R2 setup** and least-privilege token creation.
- [ ] **Step 2: Document GitHub Environment and secret setup** with redacted examples and PEM/passphrase requirements.
- [ ] **Step 3: Document first production install, automatic update prerequisites, Chrome version limitations, and manual fallback.
- [ ] **Step 4: Document key backup/rotation and three-version retention behavior.
- [ ] **Step 5: Run Markdown checks, `git diff --check`, and review links; commit `docs(iwa): document GitHub and R2 release operations`.

### Task 6: End-to-end local release rehearsal and verification

**Files:**
- Modify: `test/release-smoke.test.ts`
- Modify: `docs/iwa/release-checklist.md`

- [ ] **Step 1: Run full verification**: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm audit:iwa`, `pnpm bundle:iwa`, and focused release tests.
- [ ] **Step 2: Run a local production rehearsal** with a generated disposable Ed25519 key and fake R2 client; verify versioned artifacts, update manifest, checksum, and cleanup behavior.
- [ ] **Step 3: Run static workflow checks** proving no PR path can access production secrets.
- [ ] **Step 4: Update the release checklist** with exact first-release operator steps and known manual Chrome IWA validation requirements.
- [ ] **Step 5: Run `git diff --check` and inspect `git status --short`**; commit `test(iwa): verify production release rehearsal`.
