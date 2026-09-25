# LastRO IWA 资源源策略

Phase A 的 Worker 只允许使用以下两个被动资源源，并按顺序尝试：

1. `https://game.lastro.cn/ro/client_re/`
2. `https://clientdata.ltsd.ro/ro/client_re/`

2026-09-25 的本地验证样本中，官方源对一个已知地图资源返回 `404`，解析器随后尝试备用源。备用源当前可以尚未配置 DNS；Phase A 使用 fake fetch 覆盖官方失败、备用成功、HTML、网络错误和 HTTP 错误路径。

`.js`、`.mjs`、`.cjs`、`.wasm`、`.lua` 和 `.lub` 永远只从 IWA 包内的 `core/executable-assets.json` 清单读取。远程响应不会被当作脚本、模块、WASM 或 Lua 执行。未知扩展名和路径穿越会被拒绝；地图、模型、精灵、纹理和音频等明确列出的被动扩展名才允许远程解析。

被动资源的查找顺序是：包内查找、IndexedDB 缓存、官方源、备用源。缓存条目保存来源 URL、`ETag`、`Last-Modified`、大小和写入时间；缓存读取失败只会回到网络解析，不会改变源顺序。每个编码候选会按确定顺序生成，官方源的所有候选优先于备用源候选。

正式发布前必须逐项验证：

- `clientdata.ltsd.ro` 的 DNS、TLS、CORS 和 CORP 响应头；
- 两个源的 `Content-Type`、Range、缓存行为和非 2xx 响应；
- 已知地图、精灵、模型、纹理和音频资源的候选路径；
- Worker 初始化收到有序资源根和包内可执行资源清单；
- 远程资源审计不会出现可执行扩展名或脚本注入响应。
