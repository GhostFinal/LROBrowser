# LastRO V2 IWA 客户端

这是独立的 LastRO V2 Isolated Web App 客户端。生产网络连接只使用 Direct TCP / `TCPSocket`；WSS、WebSocket、proxy、bridge、Electron 和 NodeSocket fallback 不属于客户端路径。

Phase A 支持本地构建、审计、unsigned Web Bundle 和被 Git 忽略的本地 disposable test key 签名。账号密码由用户在 IWA IndexedDB 中按服务器 profile 管理。可用服务器为 `lastro-3x` 和 `lastro-2x`，`lastro-app` 保持不可用占位项。

## 本地命令

Linux 使用 Node 24 和仓库固定的 pnpm：

```bash
rtk proxy env PATH=/home/parker/.nvm/versions/node/v24.11.0/bin:$PATH .tools/node_modules/.bin/pnpm install
rtk proxy env PATH=/home/parker/.nvm/versions/node/v24.11.0/bin:$PATH .tools/node_modules/.bin/pnpm lint
rtk proxy env PATH=/home/parker/.nvm/versions/node/v24.11.0/bin:$PATH .tools/node_modules/.bin/pnpm typecheck
rtk proxy env PATH=/home/parker/.nvm/versions/node/v24.11.0/bin:$PATH .tools/node_modules/.bin/pnpm test
rtk proxy env PATH=/home/parker/.nvm/versions/node/v24.11.0/bin:$PATH .tools/node_modules/.bin/pnpm build
rtk proxy env PATH=/home/parker/.nvm/versions/node/v24.11.0/bin:$PATH .tools/node_modules/.bin/pnpm audit:iwa
rtk proxy env PATH=/home/parker/.nvm/versions/node/v24.11.0/bin:$PATH .tools/node_modules/.bin/pnpm bundle:iwa
./scripts/build-sign-local.sh
```

PowerShell 使用 Node 24 的 `pnpm` 执行相同脚本；脚本默认使用被 Git 忽略的 `.local/keys/`，也可通过 `LASTRO_IWA_SIGNING_KEY` 指定其他测试 key。

发行审计和本地候选包记录在 `release/`，本地 disposable test key 在 `.local/keys/`，这两个目录都被 Git 忽略。资源源策略、签名边界和手工验收流程见 `docs/iwa/`。Phase A 不配置生产签名身份、`update_manifest_url`、自动更新、GitHub Actions、Surge 或公网发布；后续 Phase B-D 需要单独批准。
