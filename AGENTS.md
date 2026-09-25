# RoBrowserV2 协作规则

- 只在本仓库工作；不要修改 `/run/media/parker/7A9F-F871/ROWeb` 基线目录。
- `.staging/`、`dist/`、`release/` 和 `.codegraph/` 是本地构建或索引目录，不要提交生成物或测试密钥。
- 生产代码只允许 Direct TCP / `TCPSocket`；不要新增 WebSocket、WSS、proxy、bridge、Electron 或 NodeSocket fallback。
- 可执行 JS/MJS/Worker/WASM/Lua/LUB 必须进入 IWA 包内清单；远程只允许两个被动资源 origin：`https://game.lastro.cn` 和 `https://clientdata.ltsd.ro`。
- 账号密码只通过用户自己的 IndexedDB 账号管理流程保存，不复制个人快捷登录、XKore、私人服务器配置、私钥或生产 secret。
- 修改后运行相关聚焦测试，并根据变更范围运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm audit:iwa` 或 `git diff --check`。
- Phase A 不执行自动更新、生产签名、GitHub Actions、Surge 或公网部署。
