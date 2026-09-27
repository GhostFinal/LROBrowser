# LastRO IWA 资源源策略

Phase A 的 Worker 只允许使用以下两个被动资源源，并按顺序尝试：

1. `https://game.lastro.cn/ro/client_re/`
2. `https://rodata.ltsd.ro/ro/client_re/`

浏览器 Fetch 不能读取官方源的跨域响应，因为响应没有 `Access-Control-Allow-Origin`。因此官方源 cache miss 时由 IWA `TCPSocket` 连接 `game.lastro.cn:80`，发送受限的 HTTP/1.1 `GET`。备用源 `rodata.ltsd.ro` 使用浏览器原生 HTTPS `fetch`，由 Chrome 自己完成 TLS；它不创建 Direct TCP 连接，也不需要代理、WebSocket 或中转服务。两条路径返回的数据统一交给 resolver。测试使用 fake `TCPSocket` 和 fake `fetch` 覆盖官方失败、备用成功、HTML、网络错误和 HTTP 错误路径。

`.js`、`.mjs`、`.cjs`、`.wasm`、`.lua` 和 `.lub` 永远只从 IWA 包内的 `core/executable-assets.json` 清单读取。远程响应不会被当作脚本、模块、WASM 或 Lua 执行。未知扩展名和路径穿越会被拒绝；地图、模型、精灵、纹理和音频等明确列出的被动扩展名才允许远程解析。

被动资源的查找顺序是：包内查找、IndexedDB 缓存、官方源、备用源。成功获取的资源会写入 IndexedDB，并保存来源 URL、`ETag`、`Last-Modified`、大小和写入时间；缓存条目至少保留 30 天，超过 30 天或时间戳无效时删除并重新获取。缓存读取失败只会回到网络解析，不会改变源顺序。每个编码候选会按确定顺序生成，官方源的所有候选优先于备用源候选；官方源出现非 404/HTML 的网络错误时直接进入备用源，不能阻断备用路径。

所有远程被动资源统一采用官方发布文件名：韩文字符恢复为 EUC-KR/CP949 字节后按 GBK 解码，单字节乱码直接按 GBK 解码，最终将得到的 Unicode 名称做 UTF-8 URL percent-encoding。这不是往 HTTP URL 写原始 GBK 字节。转换覆盖每一级目录和文件名，不限于登录图片或纹理，例如 `유저인터페이스 → 蜡历牢磐其捞胶`、`인간족/몸통/남/초보자_남.spr → 牢埃练/个烹/巢/檬焊磊_巢.spr`、`버튼소리.wav → 滚瓢家府.wav`。不再生成韩文远程 URL 候选；已有中文和 ASCII 名称不反向转换。扩展名小写、物品图标大小写和 Sprite 后缀候选仍保留，无法编码时明确失败。

本规则在共享 resolver 的远程分支实施，覆盖 Worker 的 GET_FILE / LOAD_FILE 及其地图、模型、纹理、精灵、音频和表格读取。包内清单路径和既有 IndexedDB 逻辑键不改写，不需要迁移或清空账号/资源缓存。

Direct HTTP transport 只允许 `GET`、`/ro/client_re/` 下的路径和两个批准 origin。`game.lastro.cn` 的 Direct TCP 分支固定使用 port 80；`rodata.ltsd.ro` 的分支固定转交原生 HTTPS `fetch`。它不支持重定向、压缩响应、任意 host 或远程 executable。canonical URL 始终保留 HTTPS，缓存来源也记录 HTTPS URL。

正式发布前必须逐项验证：

- `rodata.ltsd.ro` 的 DNS、HTTPS 可达性、CORS 响应和资源响应；
- 两个源的 `Content-Type`、Range、缓存行为和非 2xx 响应；
- Direct TCP 权限、DNS 失败、连接超时、HTTP 分片和二进制响应边界；
- 已知地图、精灵、模型、纹理和音频资源的候选路径；
- Worker 初始化收到有序资源根和包内可执行资源清单；
- 远程资源审计不会出现可执行扩展名或脚本注入响应。
