#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_KEY_PATH="$ROOT_DIR/.local/keys/lastro-v2-disposable-test-key.pem"
KEY_PATH="${LASTRO_IWA_SIGNING_KEY:-$DEFAULT_KEY_PATH}"

if ! command -v node >/dev/null 2>&1; then
  printf 'Node.js 24 is required but was not found.\n' >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" != "24" ]]; then
  printf 'Node.js 24 is required; found %s.\n' "$(node --version)" >&2
  exit 1
fi
NODE_BIN="$(command -v node)"

if [[ -x "$ROOT_DIR/.tools/node_modules/.bin/pnpm" ]]; then
  PNPM_BIN="$ROOT_DIR/.tools/node_modules/.bin/pnpm"
elif command -v pnpm >/dev/null 2>&1; then
  PNPM_BIN="$(command -v pnpm)"
else
  printf 'pnpm was not found. Run pnpm install first.\n' >&2
  exit 1
fi

if [[ ! -f "$KEY_PATH" ]]; then
  if ! command -v openssl >/dev/null 2>&1; then
    printf 'OpenSSL is required to generate the local disposable test key.\n' >&2
    exit 1
  fi
  mkdir -p "$(dirname "$KEY_PATH")"
  umask 077
  openssl genpkey -algorithm ED25519 -out "$KEY_PATH"
  chmod 600 "$KEY_PATH"
  printf 'Generated disposable local test key: %s\n' "$KEY_PATH"
fi

if [[ ! -r "$KEY_PATH" ]]; then
  printf 'Signing key is not readable: %s\n' "$KEY_PATH" >&2
  exit 1
fi
chmod 600 "$KEY_PATH"

cd "$ROOT_DIR"
"$NODE_BIN" scripts/prepare-runtime.mjs
"$PNPM_BIN" build
"$PNPM_BIN" audit:iwa
"$PNPM_BIN" bundle:iwa
"$PNPM_BIN" sign:iwa -- --key "$KEY_PATH"

printf '\nSigned local IWA is ready in %s/release/\n' "$ROOT_DIR"
printf 'Signing key: %s\n' "$KEY_PATH"
