# V2 来源核查记录

核查日期：2026-09-25。实施基点：`2ef74a2`。

历史迁移基线来自用户指定的外部 `ROWeb` 项目；迁移完成后，本仓库只从已审核的 `vendor/v2` 和 `vendor/core` 读取。外部目录不参与开发、测试、构建或发布。

已观察到的文件元数据：

| 文件或类别 | 大小或数量 |
| --- | --- |
| `Online.js` | 12,763,459 bytes |
| `LastROThreadEventHandler.js` | 2,874 bytes |
| `ThreadEventHandler.js` | 627,872 bytes |
| `PathFindingWorker.js` | 3,765 bytes |
| `lastro-resource-path.js` | 5,367 bytes |
| 主 bundle 引用的 `lastro-*.mjs` | 13 个 |

`vendor/v2` 固定管理 18 个生产文件及对应回归测试；生产导入排除旧 HTML 入口、`lastro-v2-config.js`、测试文件、截图和构建辅助工具。旧私人配置不读取、不复制、不加载。

导入器通过 17 个合成夹具测试：禁止在待导入文件中携带凭据/私有 profile/私钥标记、未批准 origin、未知可执行文件、路径越界和符号链接；排除旧配置；拒绝 hash 漂移；记录旧传输标记；排序并计算 SHA-256；扫描失败不覆盖已有 staging。夹具的账号与地址均为人工测试值。

`vendor/v2/Online.js` 在构建时由 `scripts/patch-v2-runtime.mjs` 生成到可删除的 `.staging/runtime/Online.js`；Worker 和 `vendor/core` 资源也只在构建阶段生成到 `.staging`。WASM 的运行时路径固定为包内路径，原始与清理后的 SHA-256、转换类别及次数只记录在本地生成清单中，不记录被删除的地址或账号值。

仓库内的 V2 源码和回归测试通过 ownership/inventory 门禁；生产 runtime 只由 `vendor/v2` 生成，旧传输实现必须在进入 `.staging/runtime` 前移除。

唯一不属于网络地址的 URI 例外是 SVG/XHTML/XLink 的三个 W3C XML 命名空间标识，用于创建本地 SVG 和截图。这些标识不是资源请求，不扩大允许的远程资源源。所有实际远程资源 origin 仍只允许官方与备用两个 HTTPS origin。

本机测试许可状态见 [许可证核查记录](third-party-licenses.md)。`.staging`、`dist` 和 `release` 都是被忽略的生成目录；可复现的源文件、模块、回归测试、字体和核心资源均在仓库内管理。

## 当前执行状态

| 任务 | 状态 | 本地提交 |
| --- | --- | --- |
| Task 1 | 完成：独立工程、manifest、最小页面区域 | `91a48ad` |
| Task 2 | 完成：来源指纹、排除私人配置、确定性清理和真实导入安全门禁 | 见本任务独立提交 |
| Task 3-12 | 尚未开始 | 无 |

已验证：manifest/shell 2 个测试、导入器夹具 17 个测试、`pnpm build`、`pnpm typecheck`、`pnpm lint`。Task 1 的运行时代码及构建输出敏感标记/origin 扫描无命中。

使用 Node 24.11.0 与仓库内 `.tools/node_modules/.bin/pnpm` 12.4.2。当前 shell 默认的 Node 22 / pnpm 12.6.0 不符合项目要求。固定版本、依赖锁和 pnpm 工作区配置已纳入 Task 1 提交。

仅有基础页面预览，尚无可登录客户端或可安装的签名 IWA。manifest 不含 `update_manifest_url`。没有创建签名密钥、生产身份、GitHub workflow、公网更新清单或 Surge 部署，也没有向远程推送。
