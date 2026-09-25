# LastRO V2 IWA Phase A 构建

Phase A 的输出是本地 unsigned `.wbn`、可选的 disposable test-key signed `.swbn`，以及审计报告。不会生成公网 `updates.json`，不会配置 GitHub Actions、Surge 或自动更新。

Linux：

```bash
rtk proxy env PATH=/home/parker/.nvm/versions/node/v24.11.0/bin:$PATH .tools/node_modules/.bin/pnpm build
rtk proxy env PATH=/home/parker/.nvm/versions/node/v24.11.0/bin:$PATH .tools/node_modules/.bin/pnpm audit:iwa
rtk proxy env PATH=/home/parker/.nvm/versions/node/v24.11.0/bin:$PATH .tools/node_modules/.bin/pnpm bundle:iwa
./scripts/build-sign-local.sh
```

PowerShell 使用相同的 `pnpm build`、`pnpm audit:iwa`、`pnpm bundle:iwa` 和 `pnpm sign:iwa -- --key <path>` 参数；将路径改为 PowerShell 的绝对路径格式。

默认 disposable test key 位于仓库内被 `.gitignore` 忽略的 `.local/keys/` 目录，也可以通过 `LASTRO_IWA_SIGNING_KEY` 指定仓库外的测试 key。Phase A 不配置生产签名密钥，不定义生产 Web Bundle ID，也不发布任何公网更新清单。签名生成的 `release-manifest.json` 只记录包名、大小、摘要、派生 ID 和 `testKey: true`。
