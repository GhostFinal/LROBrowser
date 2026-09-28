# GitHub Actions 正式发布配置

正式发布由 `.github/workflows/iwa-release.yml` 执行，PR 和普通分支由 `.github/workflows/iwa-ci.yml` 检查。PR workflow 不读取生产签名密钥，也不会写入 R2。

## GitHub Environment

在仓库 Settings → Environments 创建环境：

```text
production
```

建议为该环境启用 required reviewers。正式发布只在 `main` push 或手动 `workflow_dispatch` 时运行。

## Environment variables

以下是普通 Environment variables：

| 名称 | 类型 | 示例/要求 |
| --- | --- | --- |
| `IWA_WEB_BUNDLE_ID` | 字符串 | 生产公钥派生的 base32 Web Bundle ID；必须固定不变 |
| `IWA_UPDATE_MANIFEST_URL` | 字符串 | 已固定为 `https://client.ltsd.ro/updates.json` |
| `IWA_BUNDLE_BASE_URL` | 字符串 | 已固定为 `https://client.ltsd.ro/` |
| `R2_ACCOUNT_ID` | 字符串 | Cloudflare Account ID |
| `R2_BUCKET` | 字符串 | R2 bucket 名称 |
| `R2_ENDPOINT` | 字符串 | `https://<account-id>.r2.cloudflarestorage.com` |

## Environment secrets

以下必须作为 Secret 保存，不要放进仓库文件：

| 名称 | 类型 | 要求 |
| --- | --- | --- |
| `IWA_SIGNING_KEY` | 多行字符串 Secret | 生产 Ed25519 PKCS#8 PEM 私钥；建议使用加密 PEM；绝不能使用 `.local/keys` 的测试 key |
| `WEB_BUNDLE_SIGNING_PASSPHRASE` | 单行字符串 Secret | 加密 PEM 的口令；必须与私钥分开保存 |
| `R2_ACCESS_KEY_ID` | 单行字符串 Secret | 只授予目标 bucket 的 Object Read & Write |
| `R2_SECRET_ACCESS_KEY` | 单行字符串 Secret | 与 R2 access key 对应，不能打印到日志 |

如果使用未加密 PEM，口令可以为空，但正式环境仍建议使用加密 PEM，并定期轮换口令。私钥必须离线备份；丢失私钥会导致无法继续更新现有 IWA 身份。

## 创建生产签名 key

在安全的离线机器生成：

```bash
openssl genpkey -algorithm Ed25519 -out production-key.pem
openssl pkcs8 -in production-key.pem -topk8 -out production-key-encrypted.pem
```

只把加密后的 PEM 内容复制到 `IWA_SIGNING_KEY`。不要把私钥提交到 GitHub，也不要把它放在 workflow artifact。生产 Web Bundle ID 必须从这把公钥派生并填入 `IWA_WEB_BUNDLE_ID`。

## 创建 R2

1. 在 Cloudflare Dashboard 创建 R2 bucket。
2. 创建只授予该 bucket Object Read & Write 的 API Token / Access Key。
3. 配置公开读取方式，例如 R2 custom domain 或 Cloudflare Worker/CDN 域名。
4. 确认 `https://client.ltsd.ro/updates.json` 映射到 bucket 根目录的 `updates.json`。
5. 确认 `https://client.ltsd.ro/releases/` 映射到 bucket 的 `releases/`。

发布对象布局：

```text
updates.json
releases/<version>/lastro-v2-<commit-sha>.swbn
releases/<version>/lastro-v2-<commit-sha>.swbn.sha256
releases/<version>/release-manifest.json
releases/<version>/audit-report.json
```

发布器只在新版本对象成功上传后写 `updates.json`，并清理旧于最近三个版本的 `releases/<version>/` 对象。

## 手动发布

在 GitHub Actions 选择 `IWA Release` → `Run workflow`。发布前确认：

- `IWA_WEB_BUNDLE_ID` 与生产 key 对应；
- `IWA_UPDATE_MANIFEST_URL` 和 `IWA_BUNDLE_BASE_URL` 是 HTTPS；
- R2 bucket 已允许公开读取这些对象；
- `main` 上的测试和审计通过。

发布后检查 GitHub Release、`updates.json`、最新 `.swbn` 的 Content-Type 和 SHA-256。失败时不会更新稳定 `updates.json`；修复配置后可以重试同一个版本。

## 安全边界

Vite/esbuild 压缩、无 source map、静态审计和 Signed Web Bundle 签名可以降低源码可读性并保证来源与完整性。浏览器必须取得执行代码，因此前端代码仍然可以被用户提取和调试；混淆不是服务器秘密保护机制。
