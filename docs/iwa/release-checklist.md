# Phase A 发布检查

自动门禁：

- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm build`
- [x] `pnpm audit:iwa`
- [x] `pnpm bundle:iwa`
- [x] 使用 `.local/keys/` 中被 Git 忽略的 disposable test key 生成 `.swbn`
- [x] `pnpm test -- --run test/release-smoke.test.ts`
- [x] `git diff --check` 和 `git status --short`

Phase A 的本地候选包记录：

- unsigned：`release/lastro-v2.wbn`
- signed：`release/lastro-v2.swbn`
- 审计：`release/audit-report.json`
- 签名清单：`release/release-manifest.json`
- 测试 Web Bundle ID、版本、SHA-256 和大小：见 `release/release-manifest.json`

人工门禁记录位置：

- 2转服：`docs/iwa/manual-validation-2x.md`
- 3转服：`docs/iwa/manual-validation-3x.md`（完成真实验证后创建）

Phase A 不发布公网更新清单，不配置生产签名密钥、GitHub Actions、Surge 或自动更新。`update_manifest_url` 必须继续省略。
