import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const ONLINE_PATH = join(HERE, "Online.js");
const CLIENT_CONFIG_PATH = join(HERE, "..", "..", "src", "runtime", "client-config.ts");

test("V2 enables the CashShop entry and keeps its top-right icon wiring", () => {
  const config = readFileSync(CLIENT_CONFIG_PATH, "utf8");
  const online = readFileSync(ONLINE_PATH, "utf8");

  assert.match(config, /enableCashShop\s*:\s*true/);
  assert.match(online, /CashShopIcon_default\.append\(\)/);
  assert.match(online, /right:\s*145px[\s\S]*top:\s*17px/);
});
