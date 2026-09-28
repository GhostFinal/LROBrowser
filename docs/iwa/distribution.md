# IWA 分发与更新

正式安装包的 `manifest.webmanifest` 包含稳定的 `update_manifest_url`。Chrome 从该 URL 读取 `updates.json`，根据数字版本选择高于当前版本的 `default` channel 包。

版本使用 `0.1.<github.run_number>`；commit SHA 只用于对象路径和审计追踪。不能把 commit hash 直接写入 IWA `version`。

Chrome IWA 自动更新能力取决于浏览器版本和安装方式。无法自动更新时，用户可以从 GitHub Release 或 R2 下载最新 `.swbn` 手动安装。

同一版本路径不可覆盖不同内容。日常修复通过发布更高版本完成，不使用降级覆盖。签名密钥更换会产生新 IWA 身份，需要重新安装并单独安排迁移。
