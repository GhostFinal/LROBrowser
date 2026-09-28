# IWA GitHub Actions + Cloudflare R2 发布设计

状态：待用户审阅。

## 目标

将当前只适合本机开发和 disposable test key 的 IWA 构建链，扩展为由 GitHub Actions 全权执行的正式发布链：每次正式发布构建、静态审计、生成 unsigned Web Bundle、使用受保护的生产 Ed25519 密钥签名、生成 Chrome Web Application Update Manifest、上传 Cloudflare R2，并只保留最近三个版本。

正式产物包括版本化 `.swbn`、SHA-256 校验文件、`release-manifest.json`、`updates.json`、审计报告和 GitHub Release 附件。

## 已确认的约束

- 本仓库只使用 Direct TCP / `TCPSocket`；不能引入 WebSocket、WSS、proxy、bridge、Electron 或 NodeSocket fallback。
- 所有 JS/MJS/Worker/WASM/Lua/LUB 可执行内容必须随 Signed Web Bundle 发布；远程资源只允许被动游戏资源。
- 允许的远程资源 origin 仍只有 `https://game.lastro.cn` 和 `https://rodata.ltsd.ro`。
- `generated/`、`dist/`、`release/` 和 `.codegraph/` 不提交。
- PR workflow 不能读取生产签名密钥或 R2 写入凭据。
- 生产签名密钥不能写入仓库、日志、artifact 或普通 GitHub Actions 输出。
- Signed Web Bundle 的生产 Web Bundle ID 必须始终由同一把生产公钥派生；换钥会产生新的 IWA 身份，不能作为普通更新。
- Chrome IWA 的 `manifest.version` 只能使用数字和点组成的版本字符串，不能直接使用 commit hash。
- commit hash 用于产物文件名、发布目录、审计记录和 GitHub Release 追踪。
- 正式自动更新需要在首个公开安装包中包含稳定 HTTPS `update_manifest_url`。
- 自动更新面向支持该能力的 Chrome IWA 环境；不支持的环境仍提供手动安装 `.swbn`。

## 版本策略

正式版本使用 GitHub Actions `run_number` 生成严格递增的 IWA 版本：

```text
manifest.version = 0.1.<run_number>
```

每次 release workflow 运行必须校验该版本高于 R2 `updates.json` 中的最高版本。commit hash 使用完整 40 位 SHA，并写入：

- `release-manifest.json` 的 `commitSha`；
- 版本化对象路径；
- GitHub Release tag 和说明；
- 构建 provenance 元数据。

如果同一个版本目录已经存在，workflow 必须比较对象内容摘要；内容不同则失败，禁止覆盖。相同内容的重复重试可以幂等完成。

## 构建与签名流程

### PR / 普通 CI

`.github/workflows/iwa-ci.yml` 在 pull request 和普通分支 push 上运行：

1. 固定 Node 24 和 pnpm 12.4.2。
2. `pnpm install --frozen-lockfile`。
3. `pnpm lint`。
4. `pnpm typecheck`。
5. `pnpm test`。
6. `pnpm build`。
7. `pnpm audit:iwa`。
8. `pnpm bundle:iwa`。
9. 验证 unsigned bundle 和审计产物。

该 workflow 不读取生产签名材料，不向 R2 写入，不创建 release。

### 正式 Release

`.github/workflows/iwa-release.yml` 只允许：

- `main` 的正式 push；
- 显式 `workflow_dispatch`。

release job 使用受保护的 GitHub Environment，例如 `iwa-production`。Environment 可设置 required reviewers。流程为：

1. 执行完整 CI 检查。
2. 从 GitHub context 计算数字版本和完整 commit SHA。
3. 生成带正式 `version`、`update_manifest_url` 和版本元数据的 dist manifest。
4. 重新执行构建审计，禁止 source map、远程可执行代码、违规 origin、私有凭据和不允许的运行时 API。
5. 创建 unsigned `.wbn`。
6. 将 `IWA_SIGNING_KEY` 写入 runner 临时目录，权限设为 `0600`；口令只通过环境变量传递。
7. 使用同一生产 key 签名 `.swbn`。
8. 校验派生 Web Bundle ID 等于 `IWA_WEB_BUNDLE_ID`。
9. 生成 checksum、`release-manifest.json` 和 `updates.json`。
10. 将版本目录上传到 R2，并执行保留最近三个版本的清理。
11. 创建不可变 GitHub Release 并上传产物。
12. 通过 HTTPS 读取已发布 `updates.json` 和 `.swbn`，校验状态、Content-Type、SHA-256 和版本字段。

失败时不应删除既有版本，也不应更新稳定的 `updates.json`。

## R2 对象布局

R2 bucket 使用固定前缀：

```text
updates.json
releases/<version>/lastro-v2-<commitSha>.swbn
releases/<version>/lastro-v2-<commitSha>.swbn.sha256
releases/<version>/release-manifest.json
releases/<version>/audit-report.json
```

`updates.json` 是唯一稳定入口，格式遵循 Chrome IWA Web Application Update Manifest：

```json
{
  "versions": [
    {
      "version": "0.1.101",
      "src": "https://download.example.com/releases/0.1.101/lastro-v2-<sha>.swbn",
      "channels": ["default"]
    }
  ],
  "channels": {
    "default": { "name": "Stable" }
  }
}
```

R2 bucket 应通过 Cloudflare 公共自定义域名或受控公开 URL 读取。发布脚本只接受明确配置的 `IWA_UPDATE_MANIFEST_URL` 和 `IWA_BUNDLE_BASE_URL`，不会猜测 bucket 域名。

默认保留最近三个数字版本；清理只删除 `releases/<version>/` 下的版本对象，不删除当前最高版本，也不删除 `updates.json`。清理前先确认新版本所有对象已上传且 checksum 校验通过。

## GitHub Secrets / Environment Variables

生产 Environment 中配置：

| 名称 | 类型 | 要求 | 用途 |
| --- | --- | --- | --- |
| `IWA_SIGNING_KEY` | Secret，单行或多行 PEM 字符串 | Ed25519 PKCS#8 私钥；与首个正式安装包对应；不能是本地 disposable key | 生产 `.swbn` 签名 |
| `WEB_BUNDLE_SIGNING_PASSPHRASE` | Secret 字符串 | 如果 PEM 加密则为强口令；未加密 key 可为空，但推荐加密 | 解密签名私钥 |
| `IWA_WEB_BUNDLE_ID` | Environment variable 或 Secret 字符串 | 小写 base32 Web Bundle ID；必须等于生产公钥派生值 | 防止错误密钥发布 |
| `IWA_UPDATE_MANIFEST_URL` | Environment variable 字符串 | `https://` 的稳定 `updates.json` URL | 写入 IWA manifest |
| `IWA_BUNDLE_BASE_URL` | Environment variable 字符串 | `https://` 目录 URL，以 `/` 结尾 | 生成版本化 `.swbn` URL |
| `R2_ACCOUNT_ID` | Secret 或 Environment variable 字符串 | Cloudflare account ID | R2 endpoint |
| `R2_BUCKET` | Environment variable 字符串 | 目标 bucket 名称 | R2 bucket |
| `R2_ENDPOINT` | Environment variable 字符串 | `https://<account-id>.r2.cloudflarestorage.com` | S3-compatible endpoint |
| `R2_ACCESS_KEY_ID` | Secret 字符串 | 仅目标 bucket 的对象读写权限 | R2 上传/删除 |
| `R2_SECRET_ACCESS_KEY` | Secret 字符串 | 与 access key 对应；不能输出到日志 | R2 上传/删除 |

`IWA_SIGNING_KEY` 和 `WEB_BUNDLE_SIGNING_PASSPHRASE` 必须是不同 secret。所有 secret 只存在于 `iwa-production` Environment，不放在 repository-wide 普通 secrets，除非仓库明确限制 Environment secrets。

R2 API Token 必须只授予目标 bucket 的 Object Read & Write 权限，不授予账户管理、DNS、Workers、Zone 编辑等权限。

## 前端安全边界

客户端代码交付到用户浏览器后无法实现真正的保密加密。用户可以取得浏览器执行所需的字节并进行调试。发布系统采用以下可验证目标：

- Vite/esbuild production minification；
- 不生成或发布 source map；
- 通过静态审计移除远程可执行代码、动态代码执行和禁止网络实现；
- 将所有允许执行的 JS/MJS/Worker/WASM/Lua/LUB 放入 bundle；
- Signed Web Bundle 提供来源认证和完整性保护；
- 生产签名密钥只在受保护的 release job 中短暂出现；
- 产物、版本、commit SHA、bundle ID 和 checksum 可审计。

不会将运行时密钥、账号密码或不可逆“客户端加密”作为安全方案。混淆只作为提高逆向成本的构建优化，不作为服务器端秘密保护机制。

## 错误与回滚

- 缺少任何必需配置时，release workflow 在签名或上传前失败。
- bundle ID 不匹配时，禁止创建 GitHub Release 和更新 R2。
- 版本不递增时，禁止发布。
- 同版本内容不一致时，禁止覆盖。
- R2 上传部分失败时，不更新 `updates.json`；保留孤立对象供同一版本重试或人工清理。
- 普通回滚通过发布更高版本修复包完成，不使用降级覆盖。
- 签名私钥丢失或泄露时，需要按 IWA key rotation 流程重新安装新身份；不能期待静默迁移旧身份。

## 测试与验证

新增脚本单元测试覆盖：

- 合法和非法 IWA 版本；
- commit SHA 规范化；
- `updates.json` schema、channel、版本递增和重复版本；
- 同版本同摘要幂等、不同摘要拒绝覆盖；
- R2 对象路径生成和最近三个版本清理；
- 生产配置缺失、错误 URL、错误 bundle ID 和错误 key 的失败信息；
- 公开 release manifest 与 signed bundle 的版本、摘要、Web Bundle ID 一致。

workflow 静态检查覆盖：

- pull request 条件不能进入签名/发布 job；
- release job 必须绑定生产 Environment；
- secrets 不能传入 fork PR；
- GitHub Actions 权限使用最小值；
- action 使用固定 major/minor 或完整 commit pin；
- workflow 使用 concurrency，避免同一分支同时发布。

## 不包含在本次实现中的事项

- 代用户创建 Cloudflare 账户、R2 bucket、API token 或 GitHub secrets；
- 代用户保存或转交生产私钥；
- 公网真实域名、DNS、TLS 和中国大陆网络可达性保证；
- 将任意 commit hash 直接写入 Chrome IWA `version`；
- 声称前端混淆能够防止用户逆向客户端。
